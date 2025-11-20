# SnapPDF OCR Service

Service xử lý OCR ảnh từ AWS S3 sử dụng AWS Textract. Được thiết kế để deploy lên AWS Lambda với SQS trigger.

## 🎯 Chức năng

1. **Nhận messages từ AWS SQS (Lambda trigger)**
   - Lambda tự động triggered khi có message mới
   - Format message: `{"Id": "s3-key-path", "language": "en"}`
   - `Id`: S3 key của ảnh cần OCR
   - `language`: Ngôn ngữ của document (optional, default: "en")

2. **Xử lý OCR sử dụng AWS Textract**
   - Sử dụng `DetectDocumentTextCommand` để OCR ảnh từ S3
   - Trích xuất text, blocks, words với confidence scores
   - Lấy thông tin geometry và relationships

3. **Gửi kết quả vào AWS SQS Output Queue**
   - Kết quả bao gồm: full text, blocks, words, metadata
   - Lambda tự động xóa message đã xử lý thành công
   - Gửi error message nếu xử lý thất bại
   - Partial batch failure handling cho retry tự động

## 🏗️ Kiến trúc

### Production (AWS Lambda):
- **`index.js`**: Lambda handler, triggered bởi SQS events
- Lambda tự động scale theo số lượng messages
- Không cần polling, event-driven architecture
- AWS credentials tự động inject bởi Lambda execution role

### Local Development:
- **`local.js`**: Long-polling service để test local
- Sử dụng dotenv để load credentials
- Giống flow production nhưng chạy continuously

## 📋 Yêu cầu

- Node.js >= 14.x
- AWS Account với các quyền (thông qua Lambda execution role):
  - SQS: ReceiveMessage, DeleteMessage, SendMessage
  - Textract: DetectDocumentText
  - S3: GetObject (để Textract đọc ảnh)

## 🚀 Cài đặt

1. Clone hoặc copy project

2. Cài đặt dependencies:
```bash
npm install
```

3. **Cho Local Development**: Tạo file `.env`:
```bash
cp .env.example .env
```

4. **Cho Local Development**: Cấu hình file `.env`:
```env
# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key

# SQS Queues
INPUT_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789/input-queue
OUTPUT_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789/output-queue

# S3 Bucket
S3_BUCKET_NAME=your-bucket-name

# Polling Configuration (chỉ cho local)
MAX_MESSAGES=10
WAIT_TIME_SECONDS=20
VISIBILITY_TIMEOUT=30
```

## 🏃 Chạy Local Development

### Production mode (long polling):
```bash
npm start
```

### Development mode (với auto-reload):
```bash
npm run dev
```

**Lưu ý**: Local development chỉ để test. Production sẽ chạy trên Lambda.

## 📦 Deploy lên AWS Lambda

### 1. Package code:
```bash
# Tạo deployment package
zip -r function.zip . -x "*.git*" "node_modules/*" ".env*" "local.js"

# Hoặc nếu đã có node_modules
npm ci --production
zip -r function.zip .
```

### 2. Lambda Configuration:
- **Runtime**: Node.js 14.x hoặc mới hơn
- **Handler**: `index.handler`
- **Timeout**: 30-60 seconds (tùy theo độ phức tạp ảnh)
- **Memory**: 512-1024 MB (tùy theo kích thước ảnh)

### 3. Environment Variables (Lambda):
Set trong Lambda Configuration:
```
AWS_REGION=us-east-1
INPUT_QUEUE_URL=https://sqs...
OUTPUT_QUEUE_URL=https://sqs...
S3_BUCKET_NAME=your-bucket-name
```

### 4. SQS Trigger:
- Thêm SQS trigger cho Lambda
- Batch size: 1-10 messages
- Enable "Report batch item failures" để retry riêng từng failed message

### 5. IAM Execution Role:
Lambda execution role cần các permissions:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes",
        "sqs:SendMessage"
      ],
      "Resource": [
        "arn:aws:sqs:region:account:input-queue",
        "arn:aws:sqs:region:account:output-queue"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "textract:DetectDocumentText"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::your-bucket/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    }
  ]
}
```

## 📝 Format Input Message

Message gửi vào Input SQS Queue:

```json
{
  "Id": "documents/image-2024-01-01.jpg",
  "language": "vi"
}
```

- `Id` **(required)**: S3 key của ảnh trong bucket
- `language` *(optional)*: Mã ngôn ngữ (default: "en")

## 📤 Format Output Message

### Success Output:

```json
{
  "id": "documents/image-2024-01-01.jpg",
  "language": "vi",
  "fullText": "Extracted text content...",
  "blocks": [
    {
      "id": "block-id",
      "type": "LINE",
      "text": "Sample text",
      "confidence": 99.5,
      "geometry": {...},
      "relationships": [...]
    }
  ],
  "words": [
    {
      "text": "Sample",
      "confidence": 99.8,
      "geometry": {...}
    }
  ],
  "totalBlocks": 125,
  "documentMetadata": {
    "Pages": 1
  },
  "processedAt": "2024-01-01T12:00:00.000Z"
}
```

### Error Output:

```json
{
  "id": "documents/image-2024-01-01.jpg",
  "language": "vi",
  "error": "Error message here",
  "errorStack": "Stack trace...",
  "status": "failed",
  "processedAt": "2024-01-01T12:00:00.000Z"
}
```

## 🏗️ Cấu trúc Project

```
SnapPDF_OCR/
├── index.js                 # Lambda handler (production)
├── local.js                 # Local development với polling
├── config.js                # Configuration loader (deprecated, chỉ reference)
├── services/
│   ├── sqsService.js       # SQS operations
│   └── textractService.js  # Textract OCR operations
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

## 🔧 Kiến trúc Services

### Service Classes:
Services giờ export class (không phải singleton) để tối ưu cho Lambda:

```javascript
// services/sqsService.js
class SQSService {
  constructor() {
    // Load từ process.env
    // Lambda tự inject env vars, không cần dotenv
  }
}
module.exports = SQSService;

// index.js (Lambda)
const SQSService = require('./services/sqsService');
const sqsService = new SQSService(); // Mới instance mỗi invocation
```

### Lambda Handler:
```javascript
exports.handler = async (event, context) => {
  // event.Records chứa SQS messages
  // Process từng message
  // Return batchItemFailures cho retry
};
```

## 🎯 Batch Failure Handling

Lambda handler implement **partial batch failure**:
- Messages xử lý thành công: tự động deleted
- Messages xử lý thất bại: returned trong `batchItemFailures`
- SQS tự động retry failed messages
- Không mất message khi có lỗi

## 📊 Monitoring

### CloudWatch Logs:
Lambda tự động log vào CloudWatch:
- Số lượng messages xử lý
- OCR results (text length, blocks, words)
- Errors và stack traces

### CloudWatch Metrics:
- Lambda invocations
- Duration
- Errors
- SQS queue depth

## ⚠️ Lưu ý

1. **AWS Credentials**:
   - Production: Lambda execution role tự động handle
   - Local: Cần set trong `.env`

2. **S3 Bucket**: Ảnh phải tồn tại trong S3 bucket được cấu hình

3. **Supported Formats**: Textract hỗ trợ PNG, JPEG, PDF, TIFF

4. **File Size Limits**: 
   - Sync API (DetectDocumentText): 5 MB max
   - Async API: 500 MB max (không dùng trong service này)

5. **Cost**: AWS Lambda, Textract và SQS tính phí theo usage

6. **Timeout**: 
   - Lambda timeout phải đủ lớn cho OCR (recommend 30-60s)
   - SQS visibility timeout phải > Lambda timeout

7. **Concurrency**:
   - Lambda tự động scale theo messages
   - Set reserved concurrency nếu cần limit

## 🐛 Troubleshooting

### Lambda timeout:
- Tăng Lambda timeout
- Tăng memory (cũng tăng CPU)
- Optimize image size

### Textract errors:
- Kiểm tra S3 key có đúng không
- Kiểm tra quyền IAM của Lambda execution role
- Kiểm tra format ảnh có được hỗ trợ không
- Kiểm tra file size < 5MB

### SQS messages không được xóa:
- Check Lambda return value có đúng format không
- Enable "Report batch item failures" ở SQS trigger
- Check CloudWatch logs để xem errors

### Cold start latency:
- Tăng provisioned concurrency nếu cần
- Optimize dependencies (chỉ install cần thiết)

## 📜 License

ISC

## 👨‍💻 Author

SnapPDF OCR Service
