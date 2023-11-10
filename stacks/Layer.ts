import { StackContext, Api } from "sst/constructs";
import { Architecture, Code, LayerVersion, Runtime } from "aws-cdk-lib/aws-lambda";
import { RemovalPolicy } from "aws-cdk-lib";
import { StringParameter } from "aws-cdk-lib/aws-ssm";


export function LAYER({ stack }: StackContext) {

  const layer = new LayerVersion(stack, "layer", {
    layerVersionName: "kengine-node",
    description: "Use Kengine enhanced OpenTelemetry Distro to trace your AWS Lambda functions",
    code: Code.fromAsset("./layer-dir"),
    compatibleArchitectures: [Architecture.ARM_64, Architecture.X86_64],
    compatibleRuntimes: [Runtime.NODEJS_14_X, Runtime.NODEJS_16_X, Runtime.NODEJS_18_X],
    removalPolicy: RemovalPolicy.RETAIN,
  });

  const parameter = new StringParameter(stack, `/${stack.stage}/kengine/otel/tracer/node`, {
    parameterName: `/${stack.stage}/kengine/otel/tracer/node`,
    stringValue: layer.layerVersionArn,
  });
  
  layer.addPermission("layerPermission", {
    accountId: "*",
  });
  
  layer.applyRemovalPolicy(RemovalPolicy.RETAIN);
  stack.addOutputs({
    layerArn: layer.layerVersionArn,
    parameterName: parameter.parameterName,
  });
}
