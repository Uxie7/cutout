# Cutout

A standalone HTML, CSS, and JavaScript version of the Cutout frontend. It uses native browser APIs and has no framework or package dependencies.

## Run locally

Use a local static file server from this folder. ES modules and browser storage may not work when opening `index.html` directly with `file://`.

```powershell
python -m http.server 8080
```

Then visit <http://localhost:8080>.

## Local preview behavior

- Sign-in is a local demo gate only. It does not verify accounts or protect server resources.
- PNG, JPG, and WebP images up to 20 MB can be prepared in the browser.
- Watermarks are rendered in the browser; prepared images are stored in IndexedDB and can be downloaded or removed from the gallery.
- Background removal is unavailable because this static frontend has no image-processing service connected.
- Images and demo access remain in the current browser. Clearing browser site data removes them.

To deploy real authentication or background removal, connect a trusted backend; do not treat the demo gate as production security.
