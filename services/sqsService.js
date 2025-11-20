const { 
  SQSClient, 
  ReceiveMessageCommand, 
  DeleteMessageCommand,
  SendMessageCommand 
} = require('@aws-sdk/client-sqs');

class SQSService {
  constructor() {
    this.client = new SQSClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });
    
    this.ocrQueueUrl = process.env.AWS_SQS_OCR_QUEUE_URL;
    this.pdfQueueUrl = process.env.AWS_SQS_PDF_QUEUE_URL;
    this.maxMessages = parseInt(process.env.MAX_MESSAGES) || 10;
    this.waitTimeSeconds = parseInt(process.env.WAIT_TIME_SECONDS) || 20;
    this.visibilityTimeout = parseInt(process.env.VISIBILITY_TIMEOUT) || 30;
  }

  /**
   * Nhận messages từ SQS input queue
   */
  async receiveMessages() {
    try {
      const command = new ReceiveMessageCommand({
        QueueUrl: this.ocrQueueUrl,
        MaxNumberOfMessages: this.maxMessages,
        WaitTimeSeconds: this.waitTimeSeconds,
        VisibilityTimeout: this.visibilityTimeout,
        MessageAttributeNames: ['All'],
      });

      const response = await this.client.send(command);
      return response.Messages || [];
    } catch (error) {
      console.error('Error receiving messages from SQS:', error);
      throw error;
    }
  }

  /**
   * Xóa message sau khi xử lý thành công
   */
  async deleteMessage(receiptHandle) {
    try {
      const command = new DeleteMessageCommand({
        QueueUrl: this.ocrQueueUrl,
        ReceiptHandle: receiptHandle,
      });

      await this.client.send(command);
      console.log('Message deleted successfully');
    } catch (error) {
      console.error('Error deleting message from SQS:', error);
      throw error;
    }
  }

  /**
   * Gửi kết quả OCR vào SQS output queue
   */
  async sendResult(result) {
    try {
      const command = new SendMessageCommand({
        QueueUrl: this.pdfQueueUrl,
        MessageBody: JSON.stringify(result),
      });

      const response = await this.client.send(command);
      console.log('Result sent to output queue:', response.MessageId);
      return response;
    } catch (error) {
      console.error('Error sending message to SQS:', error);
      throw error;
    }
  }

  /**
   * Parse message body từ SQS
   */
  parseMessage(message) {
    try {
      const body = JSON.parse(message.Body);
      
      if (!body.id) {
        throw new Error('Message missing required field: Id');
      }

      return {
        id: body.id,
        language: body.language || '',
        extension: body.extension,
        receiptHandle: message.ReceiptHandle,
      };
    } catch (error) {
      console.error('Error parsing message:', error);
      throw error;
    }
  }
}

module.exports = SQSService;

