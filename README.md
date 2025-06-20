# Google Drive Index

Ứng dụng đơn giản để hiển thị và chia sẻ file từ Google Drive, được xây dựng trên Cloudflare Workers và tự động deploy thông qua Cloudflare Pages.

## Tính năng

- 📁 Hiển thị danh sách file/folder từ Google Drive
- 🗂️ **Multi-folder navigation** - Điều hướng nhiều thư mục cùng lúc
- 📄 **Pagination** - Phân trang 50 files/trang để tối ưu hiệu suất
- 🌓 Giao diện sáng/tối có thể chuyển đổi
- 📱 Responsive trên mọi thiết bị (desktop, tablet, mobile)
- 📊 Chế độ xem dạng lưới/danh sách
- 🔍 Tìm kiếm file theo tên
- 📥 Tải file trực tiếp thông qua direct URL
- 📋 Copy link file để chia sẻ
- 🔗 URL thân thiện SEO: `/folder/[name]/page/[number]`
- ↩️ Tự động chuyển hướng khi có lỗi

## Hướng dẫn cài đặt

### 1. Chuẩn bị

1. Đăng ký tài khoản [Cloudflare](https://dash.cloudflare.com/sign-up) (miễn phí)

### 2. Thiết lập Google Drive API

1. Truy cập [Google Cloud Console](https://console.cloud.google.com)
2. Tạo dự án mới hoặc chọn dự án có sẵn
3. Kích hoạt Google Drive API:
   - Vào "APIs & Services" > "Library"
   - Tìm và chọn [Google Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com)
   - Click "Enable"

   ![Kích hoạt Google Drive API](https://i.vgy.me/vhdTv3.png)

4. Tạo OAuth Client ID:
   - Vào "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - Chọn "Web application"
   - Đặt tên cho ứng dụng (ví dụ: "Google Drive Index")
   - Thêm `https://developers.google.com/oauthplayground` vào mục "Authorized redirect URIs"
   - Click "Create"
   - Lưu lại Client ID và Client Secret

   ![Tạo OAuth Client ID](https://i.vgy.me/S4wkku.png)

   - Thêm scope `https://www.googleapis.com/auth/drive.readonly` vào OAuth consent screen

   ![Thêm scope Drive API](https://i.vgy.me/JerMaA.png)

   - Thêm email test user vào OAuth consent screen để có thể chạy ứng dụng ở chế độ testing mà không cần public app (tránh phải verification app với Google vì scope drive.readonly yêu cầu xác minh nghiêm ngặt)

   ![Thêm test user](https://i.vgy.me/76SUPM.png)

### 3. Lấy Refresh Token

1. Truy cập [Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
2. Click biểu tượng cài đặt (⚙️) góc phải
3. Tích chọn ô "Use your own OAuth credentials"
4. Nhập Client ID và Client Secret từ bước trước

   ![Cài đặt OAuth Playground](https://i.vgy.me/uRK5Kb.png)

5. Đóng cài đặt
6. Bên trái, tìm "Drive API v3"
7. Chọn scope: `https://www.googleapis.com/auth/drive.readonly`
8. Click "Authorize APIs"

   ![Chọn Drive API v3](https://i.vgy.me/0yTnWi.png)

9. Click "Exchange authorization code for tokens"
10. Copy Refresh Token

   ![Copy Refresh Token](https://i.vgy.me/XAtlY6.png)

### 4. Triển khai qua Cloudflare Workers

1. **Clone repository và setup**:
   ```bash
   # Clone repository
   git clone https://github.com/minhhungtsbd/google-drive-index.git
   cd google-drive-index
   
   # Cài đặt dependencies
   npm install
   
   # Cài đặt Wrangler CLI (nếu chưa có)
   npm install -g wrangler
   ```

2. **Login vào Cloudflare**:
   ```bash
   wrangler login
   ```

3. **Cấu hình credentials**:
   ```bash
   # Copy file template
   copy wrangler.toml.example wrangler.toml
   
   # Hoặc trên Linux/Mac:
   cp wrangler.toml.example wrangler.toml
   ```

4. **Chỉnh sửa file `wrangler.toml`** với thông tin thực:
   ```toml
   [vars]
   CLIENT_ID = "123456789-abcdefghijk.apps.googleusercontent.com"
   CLIENT_SECRET = "GOCSPX-aBcDeFgHiJkLmNoPqRsTuVwXyZ"
   REFRESH_TOKEN = "1//04aBcDeFgHiJkLmNoPqRsTuVwXyZ..."
   FOLDER_ID = "1AbC2DeF3GhI4JkL5MnO6PqR7StU8VwX9YzA"
   # Thêm folder bổ sung (tùy chọn):
   FOLDER_ID_MOVIES = "2XyZ3GhI4JkL5MnO6PqR7StU8VwX9YzAaBc"
   ```

5. **Chia sẻ thư mục Google Drive**:
   - Mở thư mục trong Google Drive → Chuột phải → "Chia sẻ"
   - Chọn "Bất kỳ ai có đường liên kết" → Quyền "Người xem"

6. **Deploy**:
   ```bash
   npm run build
   wrangler deploy
   ```

7. **Hoàn thành!** Worker sẽ được deploy tại:
   ```
   ✨ https://your-worker-name.your-subdomain.workers.dev
   ```



## Hỗ trợ

Nếu bạn gặp vấn đề hoặc cần hỗ trợ, vui lòng tạo issue trên GitHub.

## License

MIT

## Demo

Bạn có thể xem trang demo tại: [https://iso.cloudmini.net/](https://iso.cloudmini.net/)

### Giao diện trang web

1. Chế độ sáng - Danh sách
   ![Giao diện sáng - Danh sách](https://i.vgy.me/BZUo4O.png)

2. Chế độ tối - Danh sách
   ![Giao diện tối - Danh sách](https://i.vgy.me/3FBAeb.png)

3. Chế độ lưới
   ![Giao diện chế độ lưới](https://i.vgy.me/IKaBZG.png)
