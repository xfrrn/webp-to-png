import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { LIMITS, formatBytes } from '../config/limits';
import { errorMessages } from '../lib/errors';
import { ConversionQueue } from '../lib/queue';

const statusText = { checking: 'Checking…', queued: 'Waiting', processing: 'Converting…', success: 'Ready', error: 'Failed' };

export default function Converter() {
  const [queue] = useState(() => new ConversionQueue());
  const state = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);
  const [ready, setReady] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [previewId, setPreviewId] = useState<string>();
  const dialog = useRef<HTMLDialogElement>(null);
  const preview = state.items.find(item => item.id === previewId && item.url);
  const input = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  useEffect(() => { setReady(true); return () => queue.clear(); }, [queue]);
  useEffect(() => {
    if (preview) dialog.current?.showModal();
    else dialog.current?.close();
  }, [preview]);
  const busy = state.importing || state.running || state.packing;
  const completed = state.items.filter(item => item.status === 'success').length;
  const failed = state.items.filter(item => item.status === 'error').length;
  const totalBytes = state.items.reduce((sum, item) => sum + (item.blob?.size || 0), 0);

  return <section className="converter" aria-label="Image converter">
    <div className="tool-heading"><h2>Convert your images</h2><span>WEBP <span aria-hidden="true">→</span> PNG</span></div>
    {!ready && <p className="loading-tool" role="status">Loading the local converter…</p>}
    <div className={`dropzone ${dragging ? 'is-dragging' : ''}`}
      onDragEnter={event => { event.preventDefault(); dragDepth.current++; setDragging(true); }}
      onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = busy ? 'none' : 'copy'; }}
      onDragLeave={event => { event.preventDefault(); if (--dragDepth.current <= 0) setDragging(false); }}
      onDrop={event => { event.preventDefault(); dragDepth.current = 0; setDragging(false); if (!busy) void queue.add(Array.from(event.dataTransfer.files)); }}>
      <div className="format-mark" aria-hidden="true"><span>WEBP</span><b>→</b><span>PNG</span></div>
      <p className="drop-title">Drop your WebP images here</p>
      <p className="drop-hint">Conversion starts automatically. Keep the pixels and transparency.</p>
      <input ref={input} type="file" id="webp-files" hidden aria-label="Choose WebP files" accept=".webp,image/webp" multiple disabled={!ready || busy || state.items.length >= LIMITS.files}
        onChange={event => { void queue.add(Array.from(event.target.files || [])); event.target.value = ''; }} />
      <button className="button primary choose-button" disabled={!ready || busy || state.items.length >= LIMITS.files} onClick={() => input.current?.click()}><span aria-hidden="true">＋</span> Choose WebP files</button>
      <p className="drop-limits">Up to {LIMITS.files} images · {formatBytes(LIMITS.inputBytes)} each · {LIMITS.pixels / 1_000_000} MP</p>
    </div>
    <div className="privacy-line"><span aria-hidden="true">✓</span> Your images stay on this device. No uploads, ever.</div>
    <div className="queue-toolbar">
      <div><h3>Your files <span className="count">{state.items.length} / {LIMITS.files}</span></h3><p>{state.items.length ? `${completed} ready${failed ? ` · ${failed} failed` : ''} · ${formatBytes(totalBytes)} of ${formatBytes(LIMITS.resultBytes)} result space` : 'Add a few images to get started.'}</p></div>
      <div className="queue-controls"><button className="text-button" disabled={!ready || busy || !completed} onClick={() => queue.removeCompleted()}>Remove completed</button><button className="text-button" disabled={!ready || !state.items.length} onClick={() => queue.clear()}>Clear all</button></div>
    </div>
    {state.skipped.length > 0 && <div className="skipped-files"><p role="status">{state.skipped.length} {state.skipped.length === 1 ? 'file was' : 'files were'} not added. Your queue holds up to {LIMITS.files} images. Save and remove completed images, then add the remaining files.</p><details><summary>See files not added</summary><ul>{state.skipped.map((name, index) => <li key={index}>{name}</li>)}</ul></details></div>}
    {state.message && <p className="error-banner" role="alert">{state.message}</p>}
    <p className={`queue-summary ${state.summary || busy ? '' : 'sr-only'}`} role="status" aria-live="polite">{state.running ? 'Converting images one at a time…' : state.importing ? 'Checking your images…' : state.packing ? 'Preparing your ZIP…' : state.summary || 'No conversion in progress.'}</p>
    {state.items.length ? <div className="file-list" role="table" aria-label="Conversion files">
      <div className="file-header file-grid" role="row"><span role="columnheader">File</span><span role="columnheader">Input</span><span role="columnheader">Output</span><span role="columnheader">Status</span><span role="columnheader">Actions</span></div>
      {state.items.map(item => <div className="file-row file-grid" role="row" key={item.id} data-testid="file-row">
        <div className="file-identity" role="cell">{item.url ? <button className="thumbnail" onClick={() => setPreviewId(item.id)} aria-label={`Preview ${item.name}`} aria-haspopup="dialog" title="Click to enlarge"><img src={item.url} alt="" width="44" height="44" /></button> : <div className="thumbnail"><span aria-hidden="true">W</span></div>}<div className="file-label"><strong title={item.originalName}>{item.originalName}</strong><span>{item.dimensions ? `${item.dimensions.width} × ${item.dimensions.height}` : 'WebP image'}{item.status === 'success' && <span className="output-name"> → {item.name}</span>}</span></div></div>
        <div role="cell"><span className="mobile-label">Input </span>{formatBytes(item.inputBytes)}</div>
        <div role="cell"><span className="mobile-label">Output </span>{item.blob ? formatBytes(item.blob.size) : '—'}</div>
        <div role="cell" className={`file-status status-${item.status}`}>{item.status === 'success' && <span aria-hidden="true">✓ </span>}{statusText[item.status]}</div>
        <div role="cell" className="file-actions">{item.status === 'success' && <button className="text-button" onClick={() => queue.download(item.id)} aria-label={`Download ${item.name}`}>Download</button>}{item.status === 'error' && item.file && <button className="text-button" disabled={busy} onClick={() => void queue.start(item.id)} aria-label={`Retry ${item.originalName}`}>Retry</button>}<button className="remove-button" onClick={() => queue.remove(item.id)} aria-label={`Remove ${item.originalName}`}>×</button></div>
        {item.error && <p className="file-error" role="cell">{errorMessages[item.error]}</p>}
      </div>)}
    </div> : <div className="empty-queue"><span aria-hidden="true">↳</span><p>Your images will appear here.<br /><span>Original dimensions. A fresh PNG.</span></p></div>}
    <div className="tool-actions"><button className="button primary" disabled={!ready || busy || !completed} onClick={() => void queue.downloadZip()}>{state.packing ? 'Preparing ZIP…' : 'Download all (.zip)'}</button><span className="zip-note">ZIP up to {formatBytes(LIMITS.zipBytes)}</span></div>
    <dialog ref={dialog} className="image-preview" aria-labelledby="preview-title" onClose={() => setPreviewId(undefined)} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      {preview && <><div className="preview-heading"><h2 id="preview-title">{preview.name}</h2><form method="dialog"><button className="text-button" autoFocus>Close preview</button></form></div><div className="preview-image"><img src={preview.url} alt={`Converted PNG: ${preview.name}`} /></div><div className="preview-footer"><p>{preview.dimensions?.width} × {preview.dimensions?.height} · {formatBytes(preview.blob?.size || 0)}<br />Checkerboard areas are transparent.</p><button className="button primary" onClick={() => queue.download(preview.id)}>Save preview PNG</button></div></>}
    </dialog>
  </section>;
}
