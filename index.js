const SQSService = require('./services/sqsService');
const TextractService = require('./services/textractService');

/**
 * AWS Lambda handler for SQS-triggered OCR processing
 * @param {Object} event - SQS event containing messages
 * @param {Object} context - Lambda context
 * @returns {Object} Response with batch item failures for partial retry
 */
exports.handler = async (event, context) => {
  console.log('Lambda invoked with', event.Records.length, 'message(s)');
  
  // Initialize services
  const sqsService = new SQSService();
  const textractService = new TextractService();
  
  // Track failed messages for partial batch failure handling
  const batchItemFailures = [];
  
  // Process each SQS message
  for (const record of event.Records) {
    try {
      await processRecord(record, sqsService, textractService);
    } catch (error) {
      console.error('Failed to process record:', {
        messageId: record.messageId,
        error: error.message,
      });
      
      // Add to batch failures for automatic retry
      batchItemFailures.push({
        itemIdentifier: record.messageId,
      });
    }
  }
  
  // Return batch item failures for Lambda to handle retries
  // Messages not in this list will be automatically deleted from queue
  return {
    batchItemFailures,
  };
};

/**
 * Process a single SQS record
 */
async function processRecord(record, sqsService, textractService) {
  let parsedMessage;
  
  try {
    // Parse message
    parsedMessage = sqsService.parseMessage(record);
    
    console.log('Processing message:', {
      id: parsedMessage.id,
      messageId: record.messageId,
    });
    
    // Perform OCR
    const ocrResult = await textractService.processOCR(
      `images/${parsedMessage.id}`
    );
    
    console.log('OCR completed:', {
      id: parsedMessage.id,
      textLength: ocrResult.fullText.length,
      totalBlocks: ocrResult.totalBlocks,
      wordsFound: ocrResult.words.length,
    });
    
    // Send result to output queue
    await sqsService.sendResult(ocrResult);
    
    console.log('✓ Successfully processed:', parsedMessage.id);
    
  } catch (error) {
    console.error('✗ Failed to process message:', error.message);
    
    // Re-throw to mark as batch failure
    throw error;
  }
}
