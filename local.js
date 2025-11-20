require('dotenv').config();
const SQSService = require('./services/sqsService');
const TextractService = require('./services/textractService');

/**
 * Local development service for testing SQS polling
 * This file is for local development only
 * In production, Lambda will be triggered by SQS events automatically
 */
class SnapPDFOCRService {
  constructor() {
    this.isRunning = false;
    this.processingCount = 0;
    this.sqsService = new SQSService();
    this.textractService = new TextractService();
  }

  /**
   * Start the service
   */
  async start() {
    
    this.isRunning = true;

    // Main processing loop
    while (this.isRunning) {
      try {
        await this.processMessages();
      } catch (error) {
        console.error('Error in main loop:', error);
        // Wait before retrying
        await this.sleep(5000);
      }
    }
  }

  /**
   * Process messages from SQS
   */
  async processMessages() {
    try {
      // Receive messages from input queue
      const messages = await this.sqsService.receiveMessages();

      // Process each message
      for (const message of messages) {
        await this.processMessage(message);
      }
    } catch (error) {
      console.error('Error processing messages:', error);
    }
  }

  /**
   * Process a single message
   */
  async processMessage(message) {
    let parsedMessage;

    try {
      // Parse message
      parsedMessage = this.sqsService.parseMessage(message);

      // Perform OCR
      const ocrResult = await this.textractService.processOCR(
        `images/${parsedMessage.id}.${parsedMessage.extension}`
      );
      console.log('OCR result:', ocrResult);

      await this.sqsService.deleteMessage(parsedMessage.receiptHandle);

      // Send result to output queue
      await this.sqsService.sendResult(ocrResult);

      console.log(`✓ Successfully processed: ${parsedMessage.id}`);

    } catch (error) {
      console.error(`✗ Failed to process message:`, error.message);
    }
  }

  /**
   * Stop the service
   */
  stop() {
    console.log('\n=== Stopping SnapPDF OCR Service ===');
    this.isRunning = false;
  }

  /**
   * Helper function to sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Initialize service
const service = new SnapPDFOCRService();

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nReceived SIGINT signal');
  service.stop();
  setTimeout(() => {
    process.exit(0);
  }, 1000);
});

process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM signal');
  service.stop();
  setTimeout(() => {
    process.exit(0);
  }, 1000);
});

// Start service
service.start().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

