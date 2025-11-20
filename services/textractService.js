const { 
  TextractClient, 
  DetectDocumentTextCommand 
} = require('@aws-sdk/client-textract');

class TextractService {
  constructor() {
    this.client = new TextractClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });
    
    this.bucketName = process.env.S3_BUCKET_NAME;
  }

  async processOCR(s3Key) {
    try {
      console.log(`Processing OCR for S3 key: ${s3Key}`);

      const command = new DetectDocumentTextCommand({
        Document: {
          S3Object: {
            Bucket: this.bucketName,
            Name: s3Key,
          },
        },
      });

      const response = await this.client.send(command);
      
      const result = this.extractText(response);      
      return result;
    } catch (error) {
      console.error('Error processing OCR:', error);
      throw error;
    }
  }

  /**
   * Trích xuất text từ Textract response
   */
  extractText(textractResponse) {
    const blocks = textractResponse.Blocks || [];
    
    // Lấy toàn bộ text
    const fullText = blocks
      .filter(block => block.BlockType === 'LINE')
      .map(block => block.Text)
      .join('\n');

    return fullText;
  }

}

module.exports = TextractService;

