// Which files a study opens: those whose extension its files.accept names (".tif,.tiff,.png"), whatever their case.
"use strict";

export function accepts(accept) {
  const opens = new Set(accept.split(",").map((e) => e.trim().toLowerCase()));
  return (name) => opens.has((name.match(/\.[^.]+$/) || [""])[0].toLowerCase());
}

// whether a file is a TIFF by its name: the one kind of image the remote store cannot picture, which the page previews itself
export const isTiff = (name) => /\.tiff?$/i.test(name);
