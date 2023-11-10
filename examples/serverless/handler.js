const { lambdaWrapper } = require('@khulnasoft/lambda-node-opentelemetry');


if (!process.env.KENGINE_ORIGINAL_HANDLER) {
    throw Error('KENGINE_ORIGINAL_HANDLER not set');
}

const [path, functionName] = process.env.KENGINE_ORIGINAL_HANDLER.split('.');
console.log(path, functionName);
const originalHandler = require(path + '.js')[functionName];

export const handler = lambdaWrapper(originalHandler);