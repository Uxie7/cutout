import { deleteImage, getImages, saveImages } from "./storage.js";
import { isSupportedImage, processImage } from "./processing.js";

const app = document.querySelector("#app");
const toastRegion = document.querySelector("#toast-region");
const SESSION_KEY = "cutout-demo-session";
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const state = {
  user: readSession(),
  files: [],
  images: [],
  addWatermark: false,
  watermarkText: "",
  watermarkPosition: "bottom-right",
  watermarkOpacity: 0.5,
  watermarkScale: 1,
  isProcessing: false,
  imageUrls: [],
};

const icons = {
  upload: '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/></svg>',
  gallery: '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>',
  cloud: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 16.2A4.5 4.5 0 0 0 18 7.5a6 6 0 0 0-11.5 1.3A3.8 3.8 0 0 0 7 16.3"/><path d="M12 12v9m-4-4 4-4 4 4"/></svg>',
  image: '<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>',
  lock: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
};

window.addEventListener("hashchange", render);
window.addEventListener("beforeunload", releaseImageUrls);

if (!location.hash) {
  location.hash = state.user ? "#/dashboard" : "#/login";
} else {
  render();
}

function readSession() {
  try {
    return sessionStorage.getItem(SESSION_KEY) || "";
  } catch (error) {
    console.error("Could not read the local demo session.", error);
    return "";
  }
}

function currentRoute() {
  const route = location.hash.replace(/^#/, "");
  return route || "/dashboard";
}

function render() {
  const route = currentRoute();

  if (route === "/login") {
    renderLogin();
    return;
  }

  if (!state.user) {
    location.hash = "#/login";
    return;
  }

  if (route === "/gallery") {
    renderShell("gallery", renderGallery());
    void loadGallery();
    return;
  }

  renderShell("dashboard", renderDashboard());
  bindDashboard();
}

function renderLogin() {
  app.innerHTML = `
    <main class="login-screen">
      <section class="login-visual" aria-label="About Cutout">
        <a class="login-brand" href="#/login" aria-label="Cutout home">
          <span class="brand-mark" aria-hidden="true">C</span>
          <span class="brand-name">cutout</span>
        </a>
        <div class="login-visual-copy">
          <h2>Good images start with a little care.</h2>
          <p>Prepare your images, add a finishing touch, and keep everything together in one simple workspace.</p>
        </div>
        <p class="login-visual-footer">A quiet little space for your creative work.</p>
      </section>
      <section class="login-panel">
        <div class="login-card">
          <div class="login-copy">
            <p class="eyebrow">Welcome to Cutout</p>
            <h1>Make yourself at home.</h1>
            <p class="page-description">Open the local preview workspace to get started.</p>
          </div>
          <div class="demo-banner">
            <span aria-hidden="true">ⓘ</span>
            <span><strong>Local demo only.</strong> This static version has no real account system; your sign-in stays on this device and is not verified.</span>
          </div>
          <form class="login-form" id="login-form">
            <div>
              <label class="field-label" for="login-email">Email address</label>
              <input class="text-input" id="login-email" type="email" autocomplete="email" placeholder="you@example.com" required>
            </div>
            <div>
              <label class="field-label" for="login-password">Password</label>
              <input class="text-input" id="login-password" type="password" autocomplete="current-password" placeholder="Enter any demo password" required>
            </div>
            <button class="primary-button" type="submit">Continue to demo <span aria-hidden="true">→</span></button>
          </form>
          <p class="login-footnote">No credentials are sent to a server.</p>
        </div>
      </section>
    </main>
  `;

  document.querySelector("#login-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const email = document.querySelector("#login-email").value.trim();
    if (!email) {
      showToast("Add an email to personalize your demo session.", "error");
      return;
    }

    try {
      sessionStorage.setItem(SESSION_KEY, email);
    } catch (error) {
      console.error("Could not save the local demo session.", error);
      showToast("This browser could not save the demo session.", "error");
      return;
    }

    state.user = email;
    location.hash = "#/dashboard";
  });
}

function renderShell(activePage, content) {
  const displayName = state.user.split("@")[0] || "Guest";
  const initials = displayName.slice(0, 2).toUpperCase();
  const title = activePage === "gallery" ? "Gallery" : "Upload images";

  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <a class="brand" href="#/dashboard" aria-label="Cutout dashboard">
          <span class="brand-mark" aria-hidden="true">C</span>
          <span class="brand-name">cutout</span>
        </a>
        <p class="workspace-label">Workspace</p>
        <nav class="nav-list" aria-label="Main navigation">
          <a class="nav-link" href="#/dashboard" ${activePage === "dashboard" ? 'aria-current="page"' : ""}>
            ${icons.upload}<span class="nav-text">Upload images</span>
          </a>
          <a class="nav-link" href="#/gallery" ${activePage === "gallery" ? 'aria-current="page"' : ""}>
            ${icons.gallery}<span class="nav-text">My gallery</span>
          </a>
        </nav>
        <div class="sidebar-bottom">
          <div class="local-note">
            <p class="local-note-title"><span class="status-dot" aria-hidden="true"></span> Local preview</p>
            <p class="local-note-copy">Your images stay in this browser. No server is connected.</p>
          </div>
          <div class="user-card">
            <span class="avatar" aria-hidden="true">${escapeHtml(initials)}</span>
            <div class="user-meta">
              <p class="user-name">${escapeHtml(displayName)}</p>
              <p class="user-plan">Demo workspace</p>
            </div>
            <button class="icon-button" id="logout-button" type="button" aria-label="Sign out of demo" title="Sign out">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>
            </button>
          </div>
        </div>
      </aside>
      <main class="main-panel">
        <header class="topbar">
          <div class="breadcrumb"><span>Workspace</span><span aria-hidden="true">/</span><strong>${title}</strong></div>
          <div class="topbar-status"><span class="status-dot" aria-hidden="true"></span> Saved in this browser</div>
        </header>
        ${content}
      </main>
    </div>
  `;

  document.querySelector("#logout-button").addEventListener("click", logout);
}

function renderDashboard() {
  return `
    <section class="page-content">
      <div class="page-heading">
        <div>
          <p class="eyebrow">Your creative workspace</p>
          <h1>Make every image yours.</h1>
          <p class="page-description">Add images, make a few adjustments, and keep your finished work close.</p>
        </div>
      </div>

      <div class="upload-layout">
        <div class="column-stack">
          <section class="card" aria-labelledby="images-title">
            <div class="card-header">
              <div class="card-title-row">
                <div>
                  <h2 class="card-title" id="images-title">Add your images</h2>
                  <p class="card-subtitle">Choose one or more images to get started.</p>
                </div>
                <span class="step-pill" aria-hidden="true">01</span>
              </div>
            </div>
            <label class="dropzone" id="dropzone" for="image-input">
              <input id="image-input" type="file" accept="image/jpeg,image/png,image/webp" multiple>
              <span class="dropzone-icon">${icons.cloud}</span>
              <span class="dropzone-title">Drop images here, or <span>browse files</span></span>
              <span class="dropzone-hint">PNG, JPG or WebP · up to 20 MB each</span>
            </label>
            <div class="file-list" id="file-list" aria-live="polite"></div>
          </section>

          <div class="process-actions">
            <p class="privacy-copy">${icons.lock} Images are processed on this device</p>
            <button class="primary-button" id="process-button" type="button" disabled>
              <span aria-hidden="true">✦</span> Prepare images
            </button>
          </div>
        </div>

        <div class="column-stack">
          <section class="card" aria-labelledby="options-title">
            <div class="card-header">
              <div class="card-title-row">
                <div>
                  <h2 class="card-title" id="options-title">Finishing touches</h2>
                  <p class="card-subtitle">Choose what your images need.</p>
                </div>
                <span class="step-pill" aria-hidden="true">02</span>
              </div>
            </div>
            <div class="option-list">
              <div class="option-row">
                <div class="option-copy">
                  <span class="option-label">Remove background</span>
                  <p class="option-description">Create a clean, transparent background.</p>
                </div>
                <button class="switch" type="button" role="switch" aria-checked="false" aria-label="Remove background" disabled></button>
              </div>
              <div class="unavailable-note">
                <span aria-hidden="true">ⓘ</span>
                <span>Background removal needs an image-processing service. It is not available in this local-only version.</span>
              </div>
              <div class="option-row">
                <div class="option-copy">
                  <span class="option-label">Add a watermark</span>
                  <p class="option-description">Mark your work with a little something of your own.</p>
                </div>
                <button class="switch" id="watermark-switch" type="button" role="switch" aria-checked="${state.addWatermark}" aria-label="Add a watermark"></button>
              </div>
              ${state.addWatermark ? renderWatermarkSettings() : ""}
            </div>
          </section>
          <div class="card" style="padding:17px 19px">
            <p class="card-title" style="font-size:12px;margin-bottom:6px">A note about this preview</p>
            <p class="card-subtitle" style="margin:0">Watermarks are applied in your browser. Finished files are saved to this device's gallery; there is no real account or cloud sync.</p>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderWatermarkSettings() {
  return `
    <div class="watermark-settings">
      <div>
        <label class="field-label" for="watermark-text">Watermark text</label>
        <input class="text-input" id="watermark-text" type="text" maxlength="80" placeholder="Your name or brand" value="${escapeHtml(state.watermarkText)}">
      </div>
      <div>
        <label class="field-label" for="watermark-position">Position</label>
        <select class="select-input" id="watermark-position">
          ${[
            ["top-left", "Top left"],
            ["top-right", "Top right"],
            ["center", "Center"],
            ["bottom-left", "Bottom left"],
            ["bottom-right", "Bottom right"],
          ].map(([value, label]) => `<option value="${value}" ${state.watermarkPosition === value ? "selected" : ""}>${label}</option>`).join("")}
        </select>
      </div>
      <div>
        <div class="range-heading">
          <label class="field-label" for="watermark-opacity">Opacity</label>
          <output class="range-value" id="opacity-value">${Math.round(state.watermarkOpacity * 100)}%</output>
        </div>
        <input class="range-input" id="watermark-opacity" type="range" min="0.1" max="1" step="0.1" value="${state.watermarkOpacity}">
      </div>
      <div>
        <div class="range-heading">
          <label class="field-label" for="watermark-scale">Size</label>
          <output class="range-value" id="scale-value">${state.watermarkScale.toFixed(1)}×</output>
        </div>
        <input class="range-input" id="watermark-scale" type="range" min="0.5" max="3" step="0.1" value="${state.watermarkScale}">
      </div>
    </div>
  `;
}

function bindDashboard() {
  const input = document.querySelector("#image-input");
  const dropzone = document.querySelector("#dropzone");
  const switchButton = document.querySelector("#watermark-switch");

  input.addEventListener("change", () => {
    addFiles([...input.files]);
    input.value = "";
  });

  dropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropzone.classList.add("is-dragging");
  });
  dropzone.addEventListener("dragleave", (event) => {
    if (!dropzone.contains(event.relatedTarget)) {
      dropzone.classList.remove("is-dragging");
    }
  });
  dropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropzone.classList.remove("is-dragging");
    addFiles([...event.dataTransfer.files]);
  });

  switchButton.addEventListener("click", () => {
    state.addWatermark = !state.addWatermark;
    render();
  });

  bindWatermarkInputs();
  renderFileList();
}

function bindWatermarkInputs() {
  const textInput = document.querySelector("#watermark-text");
  if (!textInput) {
    return;
  }

  textInput.addEventListener("input", () => {
    state.watermarkText = textInput.value;
  });
  document.querySelector("#watermark-position").addEventListener("change", (event) => {
    state.watermarkPosition = event.target.value;
  });
  document.querySelector("#watermark-opacity").addEventListener("input", (event) => {
    state.watermarkOpacity = Number(event.target.value);
    document.querySelector("#opacity-value").value = `${Math.round(state.watermarkOpacity * 100)}%`;
  });
  document.querySelector("#watermark-scale").addEventListener("input", (event) => {
    state.watermarkScale = Number(event.target.value);
    document.querySelector("#scale-value").value = `${state.watermarkScale.toFixed(1)}×`;
  });
}

function addFiles(files) {
  const accepted = [];
  const issues = [];

  for (const file of files) {
    if (!isSupportedImage(file)) {
      issues.push(`${file.name}: use a PNG, JPG, or WebP image.`);
      continue;
    }
    if (file.size > MAX_FILE_SIZE) {
      issues.push(`${file.name}: the file is larger than 20 MB.`);
      continue;
    }
    accepted.push({
      id: createId(),
      file,
      previewUrl: URL.createObjectURL(file),
    });
  }

  state.files.push(...accepted);
  renderFileList();

  if (issues.length) {
    showToast(issues.slice(0, 2).join(" "), "error");
  } else if (accepted.length) {
    showToast(`${accepted.length} image${accepted.length === 1 ? "" : "s"} ready to prepare.`, "success");
  }
}

function renderFileList() {
  const list = document.querySelector("#file-list");
  if (!list) {
    return;
  }

  list.innerHTML = state.files.map((entry) => `
    <div class="file-row">
      <img class="file-thumb" src="${entry.previewUrl}" alt="">
      <div class="file-details">
        <p class="file-name" title="${escapeHtml(entry.file.name)}">${escapeHtml(entry.file.name)}</p>
        <p class="file-size">${formatBytes(entry.file.size)}</p>
      </div>
      <button class="small-icon-button" type="button" data-remove-file="${entry.id}" aria-label="Remove ${escapeHtml(entry.file.name)}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m18 6-12 12M6 6l12 12"/></svg>
      </button>
    </div>
  `).join("");

  const button = document.querySelector("#process-button");
  if (button) {
    button.disabled = state.isProcessing || state.files.length === 0;
    button.innerHTML = state.isProcessing
      ? '<span class="spinner" aria-hidden="true"></span> Preparing…'
      : '<span aria-hidden="true">✦</span> Prepare images';
    button.onclick = processSelectedFiles;
  }

  list.querySelectorAll("[data-remove-file]").forEach((buttonElement) => {
    buttonElement.addEventListener("click", () => {
      const entry = state.files.find((file) => file.id === buttonElement.dataset.removeFile);
      if (entry) {
        URL.revokeObjectURL(entry.previewUrl);
      }
      state.files = state.files.filter((file) => file.id !== buttonElement.dataset.removeFile);
      renderFileList();
    });
  });
}

async function processSelectedFiles() {
  if (!state.files.length || state.isProcessing) {
    return;
  }
  if (state.addWatermark && !state.watermarkText.trim()) {
    showToast("Add some watermark text or turn off the watermark.", "error");
    document.querySelector("#watermark-text")?.focus();
    return;
  }

  state.isProcessing = true;
  renderFileList();

  try {
    const options = {
      addWatermark: state.addWatermark,
      watermarkText: state.watermarkText,
      watermarkPosition: state.watermarkPosition,
      watermarkOpacity: state.watermarkOpacity,
      watermarkScale: state.watermarkScale,
    };
    const prepared = await Promise.all(
      state.files.map(({ file }) => processImage(file, options)),
    );
    await saveImages(prepared);

    for (const entry of state.files) {
      URL.revokeObjectURL(entry.previewUrl);
    }
    const count = state.files.length;
    state.files = [];
    state.isProcessing = false;
    showToast(`${count} image${count === 1 ? "" : "s"} saved to your local gallery.`, "success");
    location.hash = "#/gallery";
  } catch (error) {
    console.error("Could not prepare and save the selected images.", error);
    state.isProcessing = false;
    renderFileList();
    showToast(error instanceof Error ? error.message : "Could not prepare these images.", "error");
  }
}

function renderGallery() {
  return `
    <section class="page-content">
      <div class="page-heading">
        <div>
          <p class="eyebrow">Your saved work</p>
          <h1>My gallery.</h1>
          <p class="page-description">Images prepared on this device, ready when you need them.</p>
        </div>
        <div class="gallery-toolbar">
          <span class="count-pill" id="image-count">Loading…</span>
          <a class="primary-button" href="#/dashboard"><span aria-hidden="true">+</span> Add images</a>
        </div>
      </div>
      <div id="gallery-content" aria-live="polite">
        <div class="empty-state">
          <span class="empty-icon">${icons.image}</span>
          <h2>Loading your gallery</h2>
          <p>Your locally saved images will appear here.</p>
        </div>
      </div>
    </section>
  `;
}

async function loadGallery() {
  releaseImageUrls();
  const container = document.querySelector("#gallery-content");
  const count = document.querySelector("#image-count");
  if (!container || !count) {
    return;
  }

  try {
    state.images = await getImages();
    if (!document.querySelector("#gallery-content")) {
      return;
    }

    count.textContent = `${state.images.length} image${state.images.length === 1 ? "" : "s"}`;
    if (!state.images.length) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">${icons.image}</span>
          <h2>Your gallery is ready for its first image.</h2>
          <p>Upload a few images and prepare them to see them here. They’ll stay saved in this browser.</p>
          <a class="primary-button" href="#/dashboard"><span aria-hidden="true">+</span> Upload images</a>
        </div>
      `;
      return;
    }

    container.innerHTML = `<div class="gallery-grid">${state.images.map((image) => {
      const previewUrl = URL.createObjectURL(image.blob);
      state.imageUrls.push(previewUrl);
      return `
        <article class="image-card">
          <div class="image-card-preview">
            <img src="${previewUrl}" alt="${escapeHtml(image.filename)}">
            <div class="download-overlay">
              <button class="secondary-button" type="button" data-download-image="${image.id}">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></svg>
                Download
              </button>
            </div>
          </div>
          <div class="image-card-details">
            <div style="min-width:0">
              <p class="image-card-name" title="${escapeHtml(image.filename)}">${escapeHtml(image.filename)}</p>
              <p class="image-card-date">${new Date(image.createdAt).toLocaleDateString()}</p>
            </div>
            <button class="icon-button" type="button" data-delete-image="${image.id}" aria-label="Delete ${escapeHtml(image.filename)}" title="Delete image">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/></svg>
            </button>
          </div>
        </article>
      `;
    }).join("")}</div>`;

    container.querySelectorAll("[data-download-image]").forEach((button) => {
      button.addEventListener("click", () => downloadImage(button.dataset.downloadImage));
    });
    container.querySelectorAll("[data-delete-image]").forEach((button) => {
      button.addEventListener("click", () => void removeGalleryImage(button.dataset.deleteImage));
    });
  } catch (error) {
    console.error("Could not load the local gallery.", error);
    count.textContent = "Unavailable";
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">${icons.image}</span>
        <h2>Could not open your local gallery.</h2>
        <p>${escapeHtml(error instanceof Error ? error.message : "Browser storage is unavailable.")}</p>
        <button class="secondary-button" type="button" id="retry-gallery">Try again</button>
      </div>
    `;
    document.querySelector("#retry-gallery")?.addEventListener("click", () => void loadGallery());
  }
}

function downloadImage(id) {
  const image = state.images.find((entry) => entry.id === id);
  if (!image) {
    showToast("That image is no longer in your gallery.", "error");
    return;
  }

  const url = URL.createObjectURL(image.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = makePngFilename(image.filename);
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function removeGalleryImage(id) {
  try {
    await deleteImage(id);
    state.images = state.images.filter((image) => image.id !== id);
    showToast("Image removed from your local gallery.", "success");
    await loadGallery();
  } catch (error) {
    console.error("Could not remove this gallery image.", error);
    showToast("Could not delete this image from local storage.", "error");
  }
}

function logout() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch (error) {
    console.error("Could not clear the local demo session.", error);
    showToast("This browser could not clear the demo session.", "error");
    return;
  }

  state.user = "";
  location.hash = "#/login";
}

function releaseImageUrls() {
  for (const url of state.imageUrls) {
    URL.revokeObjectURL(url);
  }
  state.imageUrls = [];
}

function showToast(message, kind = "success") {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.dataset.kind = kind;

  const title = document.createElement("p");
  title.className = "toast-title";
  title.textContent = kind === "error" ? "Something needs attention" : "All set";
  const body = document.createElement("p");
  body.className = "toast-message";
  body.textContent = message;
  toast.append(title, body);
  toastRegion.append(toast);
  window.setTimeout(() => toast.remove(), 4200);
}

function formatBytes(bytes) {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function makePngFilename(filename) {
  const nameWithoutExtension = filename.replace(/\.[^.]+$/, "");
  return `${nameWithoutExtension}-cutout.png`;
}

function createId() {
  return globalThis.crypto?.randomUUID?.()
    ?? `image-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}
