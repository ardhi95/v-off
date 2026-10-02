import { useEffect, useRef, useState } from 'react';
import { copyText } from './actions.js';
import { resumeCommand } from './present.js';

interface Props {
  agentName: string;
  sessionId: string;
  cwd?: string;
  onClose: () => void;
  onToast: (msg: string) => void;
}

/**
 * "Kirim pesan": builds a `claude --resume` command carrying the message, to paste in a
 * terminal. v-off never sends it itself (the server runs no commands from the browser).
 */
export function MessageDialog({ agentName, sessionId, cwd, onClose, onToast }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const cmdRef = useRef<HTMLTextAreaElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [message, setMessage] = useState('');
  const [copyFailed, setCopyFailed] = useState(false);
  const cmd = resumeCommand(sessionId, cwd, message);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal?.();
    textRef.current?.focus();
  }, []);

  const close = () => {
    ref.current?.close();
    onClose();
  };

  const copy = async () => {
    if (await copyText(cmd)) {
      onToast(`Perintah untuk ${agentName} disalin. Tempel di terminal.`);
      close();
    } else {
      cmdRef.current?.select();
      setCopyFailed(true);
    }
  };

  return (
    <dialog ref={ref} className="dialog" aria-labelledby="message-title" onClose={onClose} onCancel={onClose}>
      <div className="dialog-head">
        <h2 id="message-title">Kirim pesan ke {agentName}</h2>
        <button type="button" className="btn btn-ghost" onClick={close}>Tutup</button>
      </div>
      <p className="muted small">
        Pesan dikirim dengan melanjutkan sesi Claude Code di terminal. Salin perintah di bawah, lalu tempel di terminal.
      </p>
      <label className="label" htmlFor="message-text">Pesan</label>
      <textarea
        id="message-text"
        ref={textRef}
        className="field area"
        rows={3}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Contoh: lanjutkan, tes yang gagal sudah saya perbaiki"
      />
      <label className="label" htmlFor="message-cmd" style={{ marginTop: 12, display: 'block' }}>Perintah</label>
      <textarea id="message-cmd" ref={cmdRef} className="field area mono" rows={3} readOnly value={cmd} />
      <div className="actions" style={{ marginTop: 12 }}>
        <button type="button" className="btn btn-blue" onClick={copy}>Salin perintah</button>
      </div>
      {copyFailed && (
        <p role="alert" className="notice">Browser menolak akses clipboard. Perintah sudah dipilih, tekan ⌘C / Ctrl+C.</p>
      )}
    </dialog>
  );
}
