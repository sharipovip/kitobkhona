/* Inline vector category glyphs; no image service or external font. */
window.catalogCategoryIcon=function(id){
const key=String(id||'').toLowerCase();let path;
if(/peshvoi|president/.test(key))path='<path d="m3 8 9-5 9 5H3Zm2 2v9m5-9v9m4-9v9m5-9v9M3 21h18"/>';
else if(/darsi|pedagog/.test(key))path='<path d="m2 8 10-5 10 5-10 5L2 8Zm4 3v6c4 3 8 3 12 0v-6M22 8v9"/>';
else if(/bachagona/.test(key))path='<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2M10 8h.1M14 8h.1m-4 2c1 1 3 1 4 0"/>';
else if(/ilmi|fiz|khim/.test(key))path='<ellipse cx="12" cy="12" rx="10" ry="4"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)"/><circle cx="12" cy="12" r="1"/>';
else if(/jahon|khoriji|horiji/.test(key))path='<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 6h14M5 18h14"/>';
else if(/klassik|tarih|farhang/.test(key))path='<path d="M6 3h12v4c0 3-2 4-6 5 4 1 6 2 6 5v4H6v-4c0-3 2-4 6-5-4-1-6-2-6-5V3ZM4 3h16M4 21h16"/>';
else if(/muosir|zabon|zhurnal/.test(key))path='<path d="m4 20 4-1L21 6l-3-3L5 16l-1 4Zm10-13 3 3M3 22h18"/>';
else if(/tib|ravon/.test(key))path='<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6V3Z"/>';
else if(/biolog|bogh|tabiat/.test(key))path='<path d="M5 19c-4-9 3-15 15-15 0 12-6 19-15 15Zm-2 3L16 9"/>';
else if(/iqtisod|idora/.test(key))path='<path d="M4 21V11h4v10m3 0V7h4v14m3 0V3h4v18M2 21h21"/>';
else if(/informatika/.test(key))path='<rect x="3" y="3" width="18" height="13" rx="2"/><path d="M8 21h8m-4-5v5M7 7l3 3-3 3m6 0h4"/>';
else if(/musiqi/.test(key))path='<path d="M8 17V5l12-2v12M8 8l12-2"/><ellipse cx="5" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/>';
else if(/chiston/.test(key))path='<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3m0 3h.01"/>';
else if(/zindagi/.test(key))path='<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>';
else path='<path d="M12 5C9 3 5 3 2 4v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Zm0 0v15"/>';
return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+path+'</svg>';
};
