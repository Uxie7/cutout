const DATABASE_NAME = "cutout-local";
const DATABASE_VERSION = 1;
const IMAGE_STORE = "images";

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("This browser does not support local image storage."));
      return;
    }

    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(IMAGE_STORE)) {
        database.createObjectStore(IMAGE_STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open image storage."));
  });
}

export async function saveImages(images) {
  const database = await openDatabase();

  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(IMAGE_STORE, "readwrite");
      const store = transaction.objectStore(IMAGE_STORE);

      for (const image of images) {
        store.put(image);
      }

      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not save images."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Saving images was cancelled."));
    });
  } finally {
    database.close();
  }
}

export async function getImages() {
  const database = await openDatabase();

  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(IMAGE_STORE, "readonly")
        .objectStore(IMAGE_STORE)
        .getAll();

      request.onsuccess = () => {
        const images = request.result.sort(
          (left, right) => right.createdAt.localeCompare(left.createdAt),
        );
        resolve(images);
      };
      request.onerror = () => reject(request.error ?? new Error("Could not load saved images."));
    });
  } finally {
    database.close();
  }
}

export async function deleteImage(id) {
  const database = await openDatabase();

  try {
    await new Promise((resolve, reject) => {
      const request = database.transaction(IMAGE_STORE, "readwrite")
        .objectStore(IMAGE_STORE)
        .delete(id);

      request.onsuccess = resolve;
      request.onerror = () => reject(request.error ?? new Error("Could not delete the image."));
    });
  } finally {
    database.close();
  }
}
