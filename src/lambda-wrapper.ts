import api, { Attributes, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import {
	OTLPTraceExporter,
} from "@opentelemetry/exporter-trace-otlp-http";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { Instrumentation, registerInstrumentations } from "@opentelemetry/instrumentation";
import {
	AwsInstrumentation,
} from "@opentelemetry/instrumentation-aws-sdk";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { Resource } from "@opentelemetry/resources";
import { flatten } from "flat";
import { existsSync } from "fs";
import { arch } from "os"
import { ClientRequest } from "http";
import { parse } from 'querystring'

if (process.env.OTEL_LOG_LEVEL === "debug") {
	api.diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ALL);
}

const provider = new NodeTracerProvider({
	resource: new Resource({
		"service.name": process.env.KENGINE_SERVICE,
		"faas.name": process.env.AWS_LAMBDA_FUNCTION_NAME,
		"faas.max_memory": process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE,
		"faas.architecture": arch(),
		"faas.version": process.env.AWS_LAMBDA_FUNCTION_VERSION,
		'cloud.region': process.env.AWS_REGION || 'unknown',
		"cloud.provider": "aws",
	}),
	forceFlushTimeoutMillis: 500,
});

let collectorURL: string = process.env.COLLECTOR_URL || "https://otel.kengine.khulnasoft.com/v1"

if (existsSync('/opt/extensions/kengine')) {
	collectorURL = 'http://sandbox:4323/otel';
}


const spanProcessor = new BatchSpanProcessor(
	new OTLPTraceExporter({
		url: collectorURL,
		headers: {
			"x-api-key": process.env.KENGINE_KEY || process.env.KENGINE_OTEL_KEY,
		},
	}),
	{
		maxQueueSize: 100,
		maxExportBatchSize: 5,
	}
);

provider.addSpanProcessor(spanProcessor);
provider.register();

const instrumentations: Instrumentation[] = [
	new AwsInstrumentation({
		suppressInternalInstrumentation: process.env.AWS_SDK_INTERNALS === 'true' ? false : true,
		responseHook: (span, { response }) => {
			if (response) {
				const awsApiReqData = {
					request: response.request,
					response: response.data,
				};
				span.setAttributes(flatten(awsApiReqData) as Attributes);
			}
		},
	}),
	new HttpInstrumentation({
		requestHook: (span, request) => {
			if (request instanceof ClientRequest && request.host !== 'sandbox' && !request.host.includes('otel.kengine') && !request.host.includes('.amazonaws.com')) {
				const requestBodyChunks: string[] = [];
				const oldWrite = request.write.bind(request);
				request.write = (data: any) => {
					try {
						requestBodyChunks.push(decodeURIComponent(data.toString()));
					} catch (e) {

					}
					return oldWrite(data);
				};
				const oldEnd = request.end.bind(request);
				request.end = (data: any) => {
					if (data) {
						try {
							requestBodyChunks.push(decodeURIComponent(data.toString()));
						} catch (e) {
	
						}
					}
					const headers = request.getHeaders();

					const body: string = requestBodyChunks.join();
					let requestData: unknown
					if (headers['content-type'] && typeof headers['content-type'] === 'string') {
						if (headers['content-type'].includes('application/json') || headers['content-type'].includes('application/x-amz-json')) {
							try {
								requestData = JSON.parse(body);
							} catch (e) {
								requestData = body;
							}
						} else if (headers['content-type'].includes('application/x-www-form-urlencoded')) {
							try {
								requestData = parse(body);
							} catch (e) {
								requestData = body;
							}
							requestData = body;
						}
					}

					const httpReqData = {
						request: {
							headers,
							body: requestData,
						},
					};
					span.setAttributes(flatten(httpReqData) as Attributes);
					return oldEnd(data);
				};

			}
		},
	}),
]

registerInstrumentations({
	instrumentations
});

declare const global: {
	kengineLambdaFlush: () => void;
}


global['kengineLambdaFlush'] = async () => {
	try {

		// TODO figure out why this is 20ms on cold start vs 3 ms on regular invocation
		await provider.forceFlush();
	} catch (e) {
		console.log(e)
	}
};