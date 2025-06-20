export default {
  async fetch(request, env, ctx) {
    try {
      const config = {
        folderId: env.FOLDER_ID,
        clientId: env.CLIENT_ID,
        clientSecret: env.CLIENT_SECRET,
        refreshToken: env.REFRESH_TOKEN,
        tokenEndpoint: "https://oauth2.googleapis.com/token",
        driveApiEndpoint: "https://www.googleapis.com/drive/v3"
      };

      // Lấy danh sách folders từ environment variables
      const folders = {};
      
      // FOLDER_ID luôn là trang chủ mặc định (nếu có)
      if (config.folderId) {
        folders['HOME'] = config.folderId;
      }
      
      // Thêm các folder bổ sung từ FOLDER_ID_*
      Object.keys(env).forEach(key => {
        if (key.startsWith('FOLDER_ID_')) {
          const folderName = key.replace('FOLDER_ID_', '');
          folders[folderName] = env[key];
        }
      });

      // Kiểm tra environment variables
      if (!config.clientId || !config.clientSecret || !config.refreshToken) {
        return new Response(
          `Missing environment variables: 
          CLIENT_ID: ${config.clientId ? 'OK' : 'MISSING'}
          CLIENT_SECRET: ${config.clientSecret ? 'OK' : 'MISSING'}
          REFRESH_TOKEN: ${config.refreshToken ? 'OK' : 'MISSING'}
          
          Folders configured: ${Object.keys(folders).length}
          ${Object.keys(folders).map(name => `- ${name}: ${folders[name]}`).join('\n          ')}
          
          Configuration mode: ${Object.keys(folders).length > 1 ? 'Multi-folder' : Object.keys(folders).length === 1 ? 'Single folder' : 'No folders'}
          FOLDER_ID as HOME: ${config.folderId ? 'YES' : 'NO'}
          Additional folders: ${Object.keys(folders).filter(name => name !== 'HOME').length}
          
          ⚠️ Thêm environment variables vào wrangler.toml [vars] section`,
          { status: 500, headers: { 'Content-Type': 'text/plain' } }
        );
      }

      // Kiểm tra có ít nhất 1 folder được cấu hình
      if (Object.keys(folders).length === 0) {
        return new Response(
          `No folders configured! Please add at least one:
          - FOLDER_ID (for single folder setup)
          - FOLDER_ID_[NAME] (for multi-folder setup)
          
          Current environment variables:
          CLIENT_ID: ${config.clientId ? 'OK' : 'MISSING'}
          CLIENT_SECRET: ${config.clientSecret ? 'OK' : 'MISSING'} 
          REFRESH_TOKEN: ${config.refreshToken ? 'OK' : 'MISSING'}
          FOLDER_ID: ${config.folderId ? 'OK' : 'MISSING'}`,
          { status: 500, headers: { 'Content-Type': 'text/plain' } }
        );
      }

      const accessTokenCache = {
        token: null,
        expiry: 0
      };

      // Cấu hình phân trang
      const ITEMS_PER_PAGE = 50;

      async function getAccessToken() {
        try {
          if (accessTokenCache.token && accessTokenCache.expiry > Date.now()) {
            return accessTokenCache.token;
          }
          const response = await fetch(config.tokenEndpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded"
            },
            body: new URLSearchParams({
              client_id: config.clientId,
              client_secret: config.clientSecret,
              refresh_token: config.refreshToken,
              grant_type: "refresh_token"
            })
          });
          const data = await response.json();
          if (!response.ok) {
            throw new Error(`Failed to refresh access token: ${JSON.stringify(data)}`);
          }
          accessTokenCache.token = data.access_token;
          accessTokenCache.expiry = Date.now() + data.expires_in * 1000;
          return data.access_token;
        } catch (error) {
          throw new Error(`getAccessToken failed: ${error.message}`);
        }
      }

      async function findFile(filename, folderId) {
        try {
          const accessToken = await getAccessToken();
          const query = encodeURIComponent(`'${folderId}' in parents and name = '${filename}' and trashed = false`);
          const url = `${config.driveApiEndpoint}/files?q=${query}&fields=files(id,name,mimeType)`;
          const response = await fetch(url, {
            headers: {
              "Authorization": `Bearer ${accessToken}`
            }
          });
          const data = await response.json();
          return data.files ? data.files[0] : null;
        } catch (error) {
          throw new Error(`findFile failed: ${error.message}`);
        }
      }

      async function listFiles(folderId, pageToken = null) {
        try {
          const accessToken = await getAccessToken();
          const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
          let url = `${config.driveApiEndpoint}/files?q=${query}&fields=files(id,name,mimeType,size,modifiedTime),nextPageToken&pageSize=${ITEMS_PER_PAGE}&orderBy=name`;
          
          if (pageToken) {
            url += `&pageToken=${pageToken}`;
          }
          
          const response = await fetch(url, {
            headers: {
              "Authorization": `Bearer ${accessToken}`
            }
          });
          const data = await response.json();
          return {
            files: data.files || [],
            nextPageToken: data.nextPageToken || null
          };
        } catch (error) {
          throw new Error(`listFiles failed: ${error.message}`);
        }
      }

      function formatFileSize(bytes) {
        if (bytes === 0) return "0 Bytes";
        const k = 1024;
        const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
      }

      function formatDate(dateString) {
        const date = new Date(dateString);
        const hours = String(date.getHours()).padStart(2, "0");
        const minutes = String(date.getMinutes()).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const year = date.getFullYear();
        return hours + ":" + minutes + " " + day + "/" + month + "/" + year;
      }

      function getFileIcon(mimeType) {
        const icons = {
          "application/x-iso9660-image": "💿",
          "application/pdf": "📄",
          "application/zip": "📦",
          "application/x-rar-compressed": "📦",
          "application/x-7z-compressed": "📦",
          "image/jpeg": "🖼️",
          "image/png": "🖼️",
          "image/gif": "🖼️",
          "video/mp4": "🎥",
          "video/x-matroska": "🎥",
          "audio/mpeg": "🎵",
          "text/plain": "📝",
          "application/msword": "📘",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "📘",
          "application/vnd.ms-excel": "📊",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "📊",
          "application/vnd.ms-powerpoint": "📽️",
          "application/vnd.openxmlformats-officedocument.presentationml.presentation": "📽️"
        };
        return icons[mimeType] || "📄";
      }

      function getPreviewButton(mimeType, fileId) {
        const previewTypes = [
          "application/pdf",
          "image/jpeg",
          "image/png",
          "image/gif",
          "video/mp4",
          "text/plain"
        ];
        if (previewTypes.includes(mimeType)) {
          return `
          <button onclick="window.open('https://drive.google.com/file/d/${fileId}/preview')" class="btn btn-outline-info btn-sm-custom" title="Xem trước">
            <i class="fas fa-eye"></i><span class="d-none d-sm-inline ms-1">Preview</span>
          </button>
        `;
        }
        return "";
      }

      async function getDirectDownloadLink(fileId) {
        const accessToken = await getAccessToken();
        const response = await fetch(`${config.driveApiEndpoint}/files/${fileId}?fields=size,mimeType`, {
          headers: {
            "Authorization": `Bearer ${accessToken}`
          }
        });
        const fileInfo = await response.json();
        const fileSize = parseInt(fileInfo.size);
        if (fileSize > 100 * 1024 * 1024) {
          return {
            url: `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
            accessToken
          };
        }
        return {
          url: `https://drive.google.com/uc?export=download&id=${fileId}`,
          accessToken: null
        };
      }

      function generateFolderMenuHtml(folders, currentFolder) {
        if (Object.keys(folders).length <= 1) return '';
        
        // Sắp xếp folders: HOME đầu tiên, sau đó theo alphabet
        const sortedFolders = Object.keys(folders).sort((a, b) => {
          if (a === 'HOME') return -1;
          if (b === 'HOME') return 1;
          return a.localeCompare(b);
        });
        
        return `
        <div class="card mb-4">
          <div class="card-body">
            <h5 class="card-title">📁 Thư mục</h5>
            <div class="d-flex flex-wrap gap-2">
              ${sortedFolders.map(folderName => `
                <a href="/folder/${folderName}" class="btn ${currentFolder === folderName ? 'btn-primary' : 'btn-outline-secondary'} btn-sm" title="${folders[folderName]}">
                  ${folderName}
                </a>
              `).join('')}
            </div>
          </div>
        </div>
        `;
      }

      function generatePaginationHtml(currentPage, hasNextPage, folderName) {
        if (currentPage === 1 && !hasNextPage) return '';
        
        let pagination = '<nav aria-label="Pagination"><ul class="pagination justify-content-center">';
        
        // Previous button
        if (currentPage > 1) {
          const prevPage = currentPage - 1;
          const prevUrl = prevPage === 1 ? `/folder/${folderName}` : `/folder/${folderName}/page/${prevPage}`;
          pagination += `<li class="page-item"><a class="page-link" href="${prevUrl}">« Trước</a></li>`;
        } else {
          pagination += `<li class="page-item disabled"><span class="page-link">« Trước</span></li>`;
        }
        
        // Current page info
        pagination += `<li class="page-item active"><span class="page-link">Trang ${currentPage}</span></li>`;
        
        // Next button
        if (hasNextPage) {
          pagination += `<li class="page-item"><a class="page-link" href="/folder/${folderName}/page/${currentPage + 1}">Sau »</a></li>`;
        } else {
          pagination += `<li class="page-item disabled"><span class="page-link">Sau »</span></li>`;
        }
        
        pagination += '</ul></nav>';
        return pagination;
      }

      function generateListingHtml(files, folders, currentFolder, currentPage, hasNextPage) {
        const items = files.map((file) => {
          const isFolder = file.mimeType === "application/vnd.google-apps.folder";
          const icon = isFolder ? "📁" : getFileIcon(file.mimeType);
          const size = isFolder ? "-" : formatFileSize(parseInt(file.size));
          const date = new Date(file.modifiedTime).toLocaleDateString("vi-VN", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
          });
          return `
          <tr data-filename="${file.name}" data-size="${file.size || 0}" data-date="${file.modifiedTime}">
            <td class="file-name-cell">
              <div class="file-name-content">
                ${icon} <a href="/folder/${currentFolder}/${file.name}" class="file-link ms-2">${file.name}</a>
              </div>
            </td>
            <td class="d-none d-md-table-cell text-nowrap">${size}</td>
            <td class="d-none d-lg-table-cell text-nowrap">${date}</td>
            <td>
              <div class="d-flex flex-wrap gap-1 justify-content-end">
                <button onclick="copyLink('/folder/${currentFolder}/${file.name}')" class="btn btn-outline-secondary btn-sm-custom" title="Sao chép liên kết">
                  <i class="fas fa-copy"></i><span class="d-none d-sm-inline ms-1">Copy</span>
                </button>
                <a href="/folder/${currentFolder}/${file.name}" class="btn btn-outline-primary btn-sm-custom" title="Tải xuống" download>
                  <i class="fas fa-download"></i><span class="d-none d-sm-inline ms-1">Download</span>
                </a>
                ${getPreviewButton(file.mimeType, file.id)}
              </div>
            </td>
          </tr>
        `;
        }).join("");
        
        return `
        <!DOCTYPE html>
        <html lang="vi" data-theme="light">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Google Drive Index</title>
          <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
          <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
          <style>
            :root[data-theme="light"] {
              --bs-body-bg: #f8f9fa;
              --bs-body-color: #212529;
              --bs-primary: #0d6efd;
              --toast-bg: #333;
              --toast-color: white;
            }

            :root[data-theme="dark"] {
              --bs-body-bg: #212529;
              --bs-body-color: #dee2e6;
              --bs-primary: #0d6efd;
              --bs-table-bg: #2c3034;
              --bs-border-color: #495057;
              --toast-bg: #e8eaed;
              --toast-color: #202124;
            }

            [data-theme="dark"] {
              --bs-body-bg: #212529;
              --bs-body-color: #dee2e6;
              --bs-table-bg: #2c3034;
              --bs-border-color: #495057;
              --bs-secondary-bg: #343a40;
            }

            [data-theme="dark"] .bg-light {
              background-color: var(--bs-secondary-bg) !important;
            }

            [data-theme="dark"] .border {
              border-color: var(--bs-border-color) !important;
            }

            [data-theme="dark"] .table {
              --bs-table-bg: var(--bs-table-bg);
              --bs-table-border-color: var(--bs-border-color);
            }

            [data-theme="dark"] .btn-outline-secondary {
              --bs-btn-color: #adb5bd;
              --bs-btn-border-color: #6c757d;
              --bs-btn-hover-color: #000;
              --bs-btn-hover-bg: #6c757d;
              --bs-btn-hover-border-color: #6c757d;
            }

            .file-name-cell {
              max-width: 1px;
              width: 50%;
            }

            .file-name-content {
              word-wrap: break-word;
              word-break: break-all;
              white-space: normal;
              overflow-wrap: anywhere;
            }

            .file-link {
              color: var(--bs-primary);
              text-decoration: none;
            }

            .file-link:hover {
              text-decoration: underline;
            }

            .toast-custom {
              position: fixed;
              bottom: 20px;
              right: 20px;
              background: var(--toast-bg);
              color: var(--toast-color);
              border-radius: 8px;
              padding: 12px 20px;
              display: none;
              z-index: 1050;
              animation: fadeIn 0.3s;
            }

            @keyframes fadeIn {
              from { opacity: 0; transform: translateY(20px); }
              to { opacity: 1; transform: translateY(0); }
            }

            .btn-sm-custom {
              padding: 0.25rem 0.5rem;
              font-size: 0.875rem;
            }
          </style>
        </head>
        <body data-bs-theme="light">
          <div class="container-fluid py-4">
            <div class="container">
              <!-- Header -->
              <div class="row align-items-center mb-4 pb-3 border-bottom">
                <div class="col-md-6">
                  <div class="d-flex align-items-center gap-3">
                    <h1 class="h3 mb-0 text-primary">📂 Google Drive Index${Object.keys(folders).length > 1 && currentFolder !== 'HOME' ? ` - ${currentFolder}` : ''}</h1>
                    <button class="btn btn-outline-secondary rounded-circle p-2" onclick="toggleTheme()" title="Chuyển đổi giao diện sáng/tối">
                      <i class="fas fa-moon"></i>
                    </button>
                  </div>
                </div>
                <div class="col-md-6">
                  <div class="input-group">
                    <input type="text" id="search" class="form-control" placeholder="Tìm kiếm file...">
                    <span class="input-group-text"><i class="fas fa-search"></i></span>
                  </div>
                </div>
              </div>

              ${generateFolderMenuHtml(folders, currentFolder)}

              <!-- Controls -->
              <div class="row mb-3">
                <div class="col-12 text-end">
                  <select id="sortBy" class="form-select form-select-sm d-inline-block w-auto" onchange="sortFiles(this.value)">
                    <option value="name">Sắp xếp theo tên</option>
                    <option value="size">Sắp xếp theo kích thước</option>
                    <option value="date">Sắp xếp theo ngày</option>
                  </select>
                </div>
              </div>

              <!-- Table -->
              <div class="table-responsive">
                <table class="table table-hover table-bordered">
                  <thead class="table-light">
                    <tr>
                      <th class="file-name-cell">Tên</th>
                      <th class="d-none d-md-table-cell" style="width: 120px;">Kích thước</th>
                      <th class="d-none d-lg-table-cell" style="width: 150px;">Ngày sửa đổi</th>
                      <th style="width: 200px;">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${items}
                  </tbody>
                </table>
              </div>

              ${generatePaginationHtml(currentPage, hasNextPage, currentFolder)}
            </div>
          </div>

          <div id="toast" class="toast-custom"></div>
          
          <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>

          <script>
            function copyLink(link) {
              if (!link) return;
              const fullUrl = link.startsWith('/') ? window.location.origin + link : link;
              
              navigator.clipboard.writeText(fullUrl).then(function() {
                const toast = document.getElementById('toast');
                toast.textContent = 'Đã sao chép liên kết!';
                toast.style.display = 'block';
                setTimeout(function() {
                  toast.style.display = 'none';
                }, 2000);
              }).catch(function(err) {
                const toast = document.getElementById('toast');
                toast.textContent = 'Không thể sao chép liên kết!';
                toast.style.display = 'block';
                setTimeout(function() {
                  toast.style.display = 'none';
                }, 2000);
              });
            }

            function searchFiles() {
              const searchTerm = document.getElementById('search').value.toLowerCase();
              const rows = document.querySelectorAll('tbody tr');
              
              rows.forEach(function(row) {
                const fileName = row.querySelector('.file-link').textContent.toLowerCase();
                row.style.display = fileName.includes(searchTerm) ? '' : 'none';
              });
            }

            document.getElementById('search').addEventListener('input', searchFiles);

            document.addEventListener('DOMContentLoaded', function() {
              const savedTheme = localStorage.getItem('theme') || 'light';
              const body = document.body;
              const html = document.documentElement;
              const icon = document.querySelector('.btn i');
              
              body.setAttribute('data-bs-theme', savedTheme);
              html.setAttribute('data-theme', savedTheme);
              icon.className = savedTheme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
            });

            function toggleTheme() {
              const body = document.body;
              const html = document.documentElement;
              const icon = document.querySelector('.btn i');
              const currentTheme = body.getAttribute('data-bs-theme');
              const newTheme = currentTheme === 'light' ? 'dark' : 'light';
              
              body.setAttribute('data-bs-theme', newTheme);
              html.setAttribute('data-theme', newTheme);
              icon.className = newTheme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
              
              localStorage.setItem('theme', newTheme);
            }

            function sortFiles(type) {
              const items = Array.from(document.querySelectorAll('tbody tr'));
              
              items.sort((a, b) => {
                let aValue, bValue;
                
                switch(type) {
                  case 'name':
                    aValue = a.getAttribute('data-filename');
                    bValue = b.getAttribute('data-filename');
                    return aValue.localeCompare(bValue);
                  
                  case 'size':
                    aValue = parseInt(a.getAttribute('data-size')) || 0;
                    bValue = parseInt(b.getAttribute('data-size')) || 0;
                    return bValue - aValue;
                  
                  case 'date':
                    aValue = new Date(a.getAttribute('data-date'));
                    bValue = new Date(b.getAttribute('data-date'));
                    return bValue - aValue;
                }
              });

              const tbody = document.querySelector('tbody');
              items.forEach(item => tbody.appendChild(item));
            }
          </script>
        </body>
        </html>
        `;
      }

      // Xử lý request chính
      const url = new URL(request.url);
      const path = decodeURIComponent(url.pathname.slice(1));

      // Parse URL for folder and pagination
      let currentFolder = 'HOME';
      let currentPage = 1;
      let pageToken = null;
      let filename = null;

      if (path.startsWith('folder/')) {
        const parts = path.split('/');
        currentFolder = parts[1];
        
        if (parts.length > 2) {
          if (parts[2] === 'page' && parts[3]) {
            currentPage = parseInt(parts[3]) || 1;
          } else {
            // File trong folder
            filename = parts.slice(2).join('/');
          }
        }
      } else if (path) {
        // File ở root level (backward compatibility)
        filename = path;
        currentFolder = folders['HOME'] ? 'HOME' : Object.keys(folders)[0] || 'HOME';
      }

      // Nếu không có path hoặc folder không tồn tại, redirect về HOME hoặc folder đầu tiên
      if (!path || (currentFolder !== 'HOME' && !folders[currentFolder])) {
        const defaultFolder = folders['HOME'] ? 'HOME' : Object.keys(folders)[0] || 'HOME';
        return Response.redirect(`${url.origin}/folder/${defaultFolder}`, 302);
      }

      const targetFolderId = folders[currentFolder];
      if (!targetFolderId) {
        const defaultFolder = folders['HOME'] ? 'HOME' : Object.keys(folders)[0] || 'HOME';
        return Response.redirect(`${url.origin}/folder/${defaultFolder}`, 302);
      }

      // Nếu là request cho file
      if (filename) {
        const file = await findFile(filename, targetFolderId);
        if (!file) {
          return Response.redirect(`${url.origin}/folder/${currentFolder}`, 302);
        }

        if (file.mimeType === "application/vnd.google-apps.folder") {
          return Response.redirect(`${url.origin}/folder/${currentFolder}`, 302);
        }

        // Xử lý file bình thường
        const { url: downloadUrl, accessToken } = await getDirectDownloadLink(file.id);
        
        const headers = accessToken 
          ? { "Authorization": `Bearer ${accessToken}` }
          : {};

        return fetch(downloadUrl, { headers });
      }

      // Hiển thị danh sách file với pagination
      if (currentPage > 1) {
        const previousPages = currentPage - 1;
        let tempToken = null;
        
        for (let i = 0; i < previousPages; i++) {
          const tempResult = await listFiles(targetFolderId, tempToken);
          tempToken = tempResult.nextPageToken;
          if (!tempToken) break;
        }
        pageToken = tempToken;
      }

      const result = await listFiles(targetFolderId, pageToken);
      const html = generateListingHtml(result.files, folders, currentFolder, currentPage, !!result.nextPageToken);
      
      return new Response(html, {
        headers: { "Content-Type": "text/html;charset=utf-8" }
      });

    } catch (globalError) {
      // Global error handler - debug mode
      console.error('Worker error:', globalError);
      return new Response(
        `Lỗi Worker: ${globalError.message}\n\nStack trace: ${globalError.stack}`,
        { 
          status: 500, 
          headers: { 'Content-Type': 'text/plain; charset=utf-8' } 
        }
      );
    }
  }
}; 