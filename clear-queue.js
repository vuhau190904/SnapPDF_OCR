require('dotenv').config();
const { 
  SQSClient, 
  PurgeQueueCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  GetQueueAttributesCommand
} = require('@aws-sdk/client-sqs');

/**
 * Script to clear all messages from SQS queues
 * Usage:
 *   node clear-queue.js              - Clear OCR queue (input)
 *   node clear-queue.js --output     - Clear PDF queue (output)
 *   node clear-queue.js --both       - Clear both queues
 *   node clear-queue.js --detailed   - Delete messages one by one with logs
 */

class QueueCleaner {
  constructor() {
    this.client = new SQSClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });
    
    this.ocrQueueUrl = process.env.AWS_SQS_OCR_QUEUE_URL;
    this.pdfQueueUrl = process.env.AWS_SQS_PDF_QUEUE_URL;
  }

  /**
   * Get approximate number of messages in queue
   */
  async getQueueMessageCount(queueUrl) {
    try {
      const command = new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: ['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible'],
      });

      const response = await this.client.send(command);
      const visible = parseInt(response.Attributes.ApproximateNumberOfMessages) || 0;
      const notVisible = parseInt(response.Attributes.ApproximateNumberOfMessagesNotVisible) || 0;
      
      return { visible, notVisible, total: visible + notVisible };
    } catch (error) {
      console.error('Error getting queue attributes:', error.message);
      return { visible: 0, notVisible: 0, total: 0 };
    }
  }

  /**
   * Purge entire queue (fast but no detailed logs)
   */
  async purgeQueue(queueUrl, queueName) {
    try {
      console.log(`\n🗑️  Purging ${queueName} queue...`);
      
      const count = await this.getQueueMessageCount(queueUrl);
      console.log(`   Messages in queue: ${count.total} (${count.visible} visible, ${count.notVisible} in flight)`);

      if (count.total === 0) {
        console.log('   ℹ️  Queue is already empty');
        return;
      }

      const command = new PurgeQueueCommand({
        QueueUrl: queueUrl,
      });

      await this.client.send(command);
      console.log(`   ✅ Queue purged successfully!`);
      console.log(`   ⚠️  Note: It may take up to 60 seconds to complete`);
    } catch (error) {
      if (error.name === 'PurgeQueueInProgress') {
        console.log(`   ⚠️  Purge already in progress for this queue`);
      } else {
        console.error(`   ❌ Error purging queue:`, error.message);
        throw error;
      }
    }
  }

  /**
   * Delete messages one by one with detailed logs
   */
  async deleteMessagesDetailed(queueUrl, queueName) {
    console.log(`\n🗑️  Deleting messages from ${queueName} queue (detailed mode)...`);
    
    let totalDeleted = 0;
    let hasMore = true;

    while (hasMore) {
      try {
        // Receive messages
        const command = new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 2,
          VisibilityTimeout: 30,
        });

        const response = await this.client.send(command);
        const messages = response.Messages || [];

        if (messages.length === 0) {
          hasMore = false;
          break;
        }

        // Delete each message
        for (const message of messages) {
          try {
            let messagePreview = '';
            try {
              const body = JSON.parse(message.Body);
              messagePreview = body.id || message.MessageId;
            } catch {
              messagePreview = message.MessageId;
            }

            const deleteCommand = new DeleteMessageCommand({
              QueueUrl: queueUrl,
              ReceiptHandle: message.ReceiptHandle,
            });

            await this.client.send(deleteCommand);
            totalDeleted++;
            console.log(`   ✓ Deleted message: ${messagePreview}`);
          } catch (deleteError) {
            console.error(`   ✗ Failed to delete message:`, deleteError.message);
          }
        }

        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error('   Error receiving messages:', error.message);
        break;
      }
    }

    console.log(`   ✅ Total deleted: ${totalDeleted} messages`);
  }

  /**
   * Clear queue (choose method based on mode)
   */
  async clearQueue(queueUrl, queueName, detailed = false) {
    if (detailed) {
      await this.deleteMessagesDetailed(queueUrl, queueName);
    } else {
      await this.purgeQueue(queueUrl, queueName);
    }
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const detailed = args.includes('--detailed') || args.includes('-d');
  const output = args.includes('--output') || args.includes('-o');
  const both = args.includes('--both') || args.includes('-b');

  const cleaner = new QueueCleaner();

  console.log('╔════════════════════════════════════════╗');
  console.log('║   SnapPDF OCR - Queue Cleaner          ║');
  console.log('╚════════════════════════════════════════╝');

  if (!cleaner.ocrQueueUrl && !cleaner.pdfQueueUrl) {
    console.error('\n❌ Error: No queue URLs configured');
    console.error('   Please set AWS_SQS_OCR_QUEUE_URL and/or AWS_SQS_PDF_QUEUE_URL in .env');
    process.exit(1);
  }

  try {
    if (both) {
      // Clear both queues
      if (cleaner.ocrQueueUrl) {
        await cleaner.clearQueue(cleaner.ocrQueueUrl, 'OCR (Input)', detailed);
      }
      if (cleaner.pdfQueueUrl) {
        await cleaner.clearQueue(cleaner.pdfQueueUrl, 'PDF (Output)', detailed);
      }
    } else if (output) {
      // Clear output queue only
      if (!cleaner.pdfQueueUrl) {
        console.error('\n❌ Error: PDF queue URL not configured');
        process.exit(1);
      }
      await cleaner.clearQueue(cleaner.pdfQueueUrl, 'PDF (Output)', detailed);
    } else {
      // Clear input queue by default
      if (!cleaner.ocrQueueUrl) {
        console.error('\n❌ Error: OCR queue URL not configured');
        process.exit(1);
      }
      await cleaner.clearQueue(cleaner.ocrQueueUrl, 'OCR (Input)', detailed);
    }

    console.log('\n✨ Done!\n');
  } catch (error) {
    console.error('\n💥 Fatal error:', error.message);
    process.exit(1);
  }
}

// Run
main();

