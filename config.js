require('dotenv').config();

module.exports = {
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  },
  sqs: {
    inputQueueUrl: process.env.INPUT_QUEUE_URL,
    outputQueueUrl: process.env.OUTPUT_QUEUE_URL,
    maxMessages: parseInt(process.env.MAX_MESSAGES) || 10,
    waitTimeSeconds: parseInt(process.env.WAIT_TIME_SECONDS) || 20,
    visibilityTimeout: parseInt(process.env.VISIBILITY_TIMEOUT) || 30,
  },
  s3: {
    bucketName: process.env.S3_BUCKET_NAME,
  },
};

