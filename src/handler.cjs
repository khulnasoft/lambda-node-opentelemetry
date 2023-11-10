const { loadSync } = require('./load-sync');
const { wrap } = require('./index');

const actualHandler = process.env.KENGINE_ACTUAL_HANDLER;
const taskRoot = process.env.LAMBDA_TASK_ROOT;

if(!taskRoot) {
    throw Error('LAMBDA_TASK_ROOT is not defined');
}

if(!actualHandler) {
    throw Error('KENGINE_ACTUAL_HANDLER is not defined');
}

const handler = loadSync(taskRoot, actualHandler);

exports.handler = wrap(handler);