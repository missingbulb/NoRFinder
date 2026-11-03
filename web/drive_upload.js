// The bodies of Drive's uploads, written out as bytes, not a FormData or a Blob: Playwright's WebKit hands a page test
// a FormData or Blob body with its parts empty, where bytes arrive whole.
const encode = (t) => new TextEncoder().encode(t);

// A multipart upload (uploadType=multipart, documented as multipart/related): the file's details, then the file, in one
// request. details: the file's metadata; file: a string or a Blob; type: the file's content type. {headers, body}.
export async function multipart(details, file, type) {
  const cut = "rauntruth-" + Math.random().toString(36).slice(2);
  const head = encode(`--${cut}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(details)}\r\n--${cut}\r\nContent-Type: ${type}\r\n\r\n`);
  const content = typeof file === "string" ? encode(file) : new Uint8Array(await file.arrayBuffer());
  const tail = encode(`\r\n--${cut}--\r\n`);
  const body = new Uint8Array(head.length + content.length + tail.length);
  body.set(head, 0); body.set(content, head.length); body.set(tail, head.length + content.length);
  return { headers: { "content-type": `multipart/related; boundary=${cut}` }, body: body.buffer };
}

// A media upload (uploadType=media): the file's content alone, a Blob. {headers, body}.
export const media = async (blob) => ({ headers: { "content-type": blob.type || "application/octet-stream" }, body: await blob.arrayBuffer() });
