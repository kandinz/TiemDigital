<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { SwaggerUIBundle, SwaggerUIStandalonePreset } from 'swagger-ui-dist';
import 'swagger-ui-dist/swagger-ui.css';
import { productOpenApiSpec } from './productApiSpec';
import {
  ArrowLeft,
  FileCode2,
  Copy,
  Check,
  Download,
  ExternalLink,
  Sparkles,
  BookOpen,
  Code,
  ShieldCheck,
  Layers,
  X,
} from 'lucide-vue-next';

const router = useRouter();
const isCopied = ref(false);
const showRawSpecModal = ref(false);

const baseUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/admin/mmo/catalog` : '/api/admin/mmo/catalog';

onMounted(() => {
  try {
    SwaggerUIBundle({
      dom_id: '#swagger-ui-container',
      spec: productOpenApiSpec,
      presets: [
        SwaggerUIBundle.presets.apis,
        SwaggerUIStandalonePreset,
      ],
      layout: 'BaseLayout',
      deepLinking: true,
      docExpansion: 'list',
      defaultModelsExpandDepth: 1,
      defaultModelExpandDepth: 1,
      showExtensions: true,
      showCommonExtensions: true,
      displayRequestDuration: true,
    });
  } catch (err) {
    console.error('Failed to initialize Swagger UI:', err);
  }
});

const copyBaseUrl = async () => {
  try {
    await navigator.clipboard.writeText(baseUrl);
    isCopied.value = true;
    setTimeout(() => {
      isCopied.value = false;
    }, 2000);
  } catch {
    const input = document.createElement('textarea');
    input.value = baseUrl;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    isCopied.value = true;
    setTimeout(() => {
      isCopied.value = false;
    }, 2000);
  }
};

const downloadSpec = () => {
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(productOpenApiSpec, null, 2));
  const dlAnchorElem = document.createElement('a');
  dlAnchorElem.setAttribute('href', dataStr);
  dlAnchorElem.setAttribute('download', 'tiemdigital-mmo-openapi.json');
  dlAnchorElem.click();
};

const goBackToProducts = () => {
  router.push('/product');
};
</script>

<template>
  <div class="min-h-[calc(100vh-64px)] pb-20 px-3 sm:px-6 lg:px-8 max-w-7xl mx-auto flex flex-col gap-5 pt-3">
    <!-- Top Action / Back Navigation Bar -->
    <div class="flex items-center justify-between gap-3 flex-wrap">
      <button
        type="button"
        @click="goBackToProducts"
        class="inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-app-surface hover:bg-app-surface-hover border border-app-border text-xs sm:text-sm font-bold text-app-text-base transition-colors shadow-2xs group touch-active"
      >
        <ArrowLeft class="w-4 h-4 text-app-accent group-hover:-translate-x-0.5 transition-transform" />
        <span>Về Danh Mục Sản Phẩm</span>
      </button>

      <div class="flex items-center gap-2 flex-wrap">
        <!-- Copy Base URL -->
        <button
          type="button"
          @click="copyBaseUrl"
          class="inline-flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-app-surface hover:bg-app-surface-hover border border-app-border text-xs font-bold text-app-text transition-colors shadow-2xs touch-active"
          :title="baseUrl"
        >
          <Check v-if="isCopied" class="w-4 h-4 text-emerald-500" />
          <Copy v-else class="w-4 h-4 text-app-text-sub" />
          <span>{{ isCopied ? 'Đã chép Base URL' : 'Sao chép Base URL' }}</span>
        </button>

        <!-- Download JSON Spec -->
        <button
          type="button"
          @click="downloadSpec"
          class="inline-flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-app-surface hover:bg-app-surface-hover border border-app-border text-xs font-bold text-app-text transition-colors shadow-2xs touch-active"
          title="Tải tệp openapi.json về máy"
        >
          <Download class="w-4 h-4 text-app-text-sub" />
          <span class="hidden sm:inline">Tải OpenAPI JSON</span>
          <span class="sm:hidden">JSON</span>
        </button>

        <!-- Raw JSON Viewer Modal Toggle -->
        <button
          type="button"
          @click="showRawSpecModal = true"
          class="inline-flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-app-surface hover:bg-app-surface-hover border border-app-border text-xs font-bold text-app-text transition-colors shadow-2xs touch-active"
        >
          <Code class="w-4 h-4 text-app-text-sub" />
          <span>Xem Spec</span>
        </button>

        <!-- Open live openapi.json in new tab -->
        <a
          href="/api/admin/mmo/catalog/openapi.json"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-app-accent/10 hover:bg-app-accent/20 border border-app-accent/30 text-xs font-bold text-app-accent transition-colors shadow-2xs touch-active"
        >
          <ExternalLink class="w-4 h-4" />
          <span>Live Endpoint</span>
        </a>
      </div>
    </div>

    <!-- Header Hero Banner -->
    <div class="relative overflow-hidden rounded-3xl bg-gradient-to-br from-app-surface to-app-bg border border-app-border p-5 sm:p-7 shadow-sm">
      <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative z-10">
        <div class="space-y-2">
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-app-accent/10 text-app-accent border border-app-accent/20 text-xs font-bold tracking-tight">
            <FileCode2 class="w-3.5 h-3.5" />
            <span>Interactive OpenAPI 3.0 Documentation</span>
          </div>

          <h1 class="text-xl sm:text-3xl font-black text-app-text-base tracking-tight flex items-center gap-2.5">
            Swagger API — Trang Sản Phẩm
          </h1>

          <p class="text-xs sm:text-sm text-app-text-sub max-w-2xl leading-relaxed">
            Tài liệu đặc tả chuẩn OpenAPI 3.0 cho phân hệ Danh mục Sản phẩm & Kệ Bán lẻ MMO. Hỗ trợ tra cứu bảng giá, bộ lọc danh mục, tìm kiếm công khai, cùng cụm API quản trị Admin để thêm, sửa, đồng bộ giá vốn từ các Vendor.
          </p>
        </div>

        <!-- Quick Summary Cards -->
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 w-full md:w-auto shrink-0">
          <div class="p-3 rounded-2xl bg-app-bg border border-app-border text-center shadow-2xs">
            <span class="text-[10px] text-app-text-sub uppercase font-bold block tracking-wider">Đặc tả</span>
            <span class="text-sm sm:text-base font-black font-mono text-app-accent">OAS 3.0</span>
          </div>
          <div class="p-3 rounded-2xl bg-app-bg border border-app-border text-center shadow-2xs">
            <span class="text-[10px] text-app-text-sub uppercase font-bold block tracking-wider">Phiên bản</span>
            <span class="text-sm sm:text-base font-black font-mono text-emerald-500">v1.0.0</span>
          </div>
          <div class="col-span-2 sm:col-span-1 p-3 rounded-2xl bg-app-bg border border-app-border text-center shadow-2xs">
            <span class="text-[10px] text-app-text-sub uppercase font-bold block tracking-wider">Xác thực</span>
            <span class="text-xs sm:text-sm font-bold font-mono text-app-text">Bearer / Public</span>
          </div>
        </div>
      </div>

      <!-- Quick Guidance Notes -->
      <div class="mt-4 pt-4 border-t border-app-border/60 flex flex-wrap items-center gap-4 text-xs text-app-text-sub">
        <div class="flex items-center gap-1.5">
          <BookOpen class="w-4 h-4 text-sky-500" />
          <span><b>Public API:</b> <code class="px-1.5 py-0.5 rounded bg-app-bg border border-app-border font-mono text-[11px] text-app-text">GET /api/admin/mmo/catalog</code> (Không cần đăng nhập)</span>
        </div>
        <div class="flex items-center gap-1.5">
          <ShieldCheck class="w-4 h-4 text-amber-500" />
          <span><b>Admin API:</b> Cần header <code class="px-1.5 py-0.5 rounded bg-app-bg border border-app-border font-mono text-[11px] text-app-text">Authorization: Bearer &lt;token&gt;</code></span>
        </div>
      </div>
    </div>

    <!-- Swagger UI Render Container Card -->
    <div class="rounded-3xl bg-white border border-app-border shadow-sm p-3 sm:p-6 overflow-hidden">
      <div id="swagger-ui-container" class="swagger-ui-wrapper"></div>
    </div>

    <!-- Raw Spec Modal -->
    <div
      v-if="showRawSpecModal"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div class="bg-app-surface border border-app-border rounded-3xl max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        <div class="p-4 sm:p-5 border-b border-app-border flex items-center justify-between">
          <div class="flex items-center gap-2">
            <FileCode2 class="w-5 h-5 text-app-accent" />
            <h3 class="font-bold text-base text-app-text-base">OpenAPI 3.0 Raw JSON Specification</h3>
          </div>
          <button
            type="button"
            @click="showRawSpecModal = false"
            class="p-1 rounded-full text-app-text-sub hover:text-app-text hover:bg-app-bg transition-colors"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <div class="p-4 sm:p-5 overflow-auto flex-1 bg-slate-950 font-mono text-xs text-emerald-400 select-text leading-relaxed">
          <pre>{{ JSON.stringify(productOpenApiSpec, null, 2) }}</pre>
        </div>

        <div class="p-4 border-t border-app-border bg-app-bg flex items-center justify-between">
          <button
            type="button"
            @click="downloadSpec"
            class="px-4 py-2 rounded-xl border border-app-border bg-app-surface hover:bg-app-surface-hover text-app-text text-xs font-bold flex items-center gap-1.5 transition-colors"
          >
            <Download class="w-4 h-4" />
            <span>Tải JSON</span>
          </button>

          <button
            type="button"
            @click="showRawSpecModal = false"
            class="px-5 py-2 rounded-xl bg-app-accent text-white text-xs font-bold hover:bg-app-accent-hover transition-colors shadow-accent"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
/* Modern styling enhancements for embedded Swagger UI inside Gum Tool */
.swagger-ui-wrapper {
  font-family: inherit;
  color: #1e293b;
}

.swagger-ui .topbar {
  display: none !important;
}

.swagger-ui .information-container {
  padding: 12px 0 20px 0;
  border-bottom: 1px solid #e2e8f0;
  margin-bottom: 20px;
}

.swagger-ui .info .title {
  font-size: 24px;
  font-weight: 800;
  color: #0f172a;
}

.swagger-ui .info p {
  color: #475569;
  line-height: 1.6;
}

.swagger-ui .scheme-container {
  background: #f8fafc;
  box-shadow: none;
  border-radius: 16px;
  padding: 16px;
  border: 1px solid #e2e8f0;
  margin-bottom: 24px;
}

.swagger-ui .opblock {
  border-radius: 16px !important;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  margin: 0 0 16px 0 !important;
  overflow: hidden;
}

.swagger-ui .opblock .opblock-summary {
  padding: 10px 16px;
}

.swagger-ui .opblock-tag {
  font-size: 16px;
  font-weight: 800;
  color: #0f172a;
  border-bottom: 1px solid #e2e8f0;
  padding: 14px 0 8px 0;
  margin-bottom: 12px;
}

.swagger-ui .btn {
  border-radius: 12px !important;
  font-weight: 700;
  transition: all 0.2s;
}

.swagger-ui select,
.swagger-ui input[type='text'] {
  border-radius: 10px !important;
}

.swagger-ui table {
  border-collapse: separate;
  border-spacing: 0;
}
</style>
