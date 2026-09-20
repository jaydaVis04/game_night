import { useEffect, useId, useRef } from 'react';
import Icon from './Icons.jsx';

export function Modal({ title, description, onClose, children, className = '' }) {
  const ref = useRef(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return <dialog ref={ref} className={`modal ${className}`} aria-labelledby={id} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === ref.current) { const rect = ref.current.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose(); } }}>
    <div className="modal-heading"><div><h2 id={id}>{title}</h2>{description ? <p>{description}</p> : null}</div><button className="icon-button" aria-label="Close dialog" onClick={onClose}><Icon name="close" /></button></div>
    {children}
  </dialog>;
}

export function Avatar({ name, size = '', crowned = false }) {
  const hash = Array.from(name).reduce((total, char) => total + char.charCodeAt(0), 0);
  const initials = name.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join('').toLocaleUpperCase();
  return <span className={`avatar avatar-${hash % 6} ${size ? `avatar-${size}` : ''}`} aria-hidden="true">{crowned ? <span className="avatar-crown">♛</span> : null}{initials}</span>;
}

export function Field({ label, hint, ...props }) {
  const id = useId();
  return <label className="field" htmlFor={id}><span id={`${id}-label`}>{label}</span><input id={id} aria-labelledby={`${id}-label`} aria-describedby={hint ? `${id}-hint` : undefined} {...props} />{hint ? <small id={`${id}-hint`}>{hint}</small> : null}</label>;
}

export function FormError({ children }) {
  return children ? <p className="form-error" role="alert">{children}</p> : null;
}

export function EmptyState({ icon = 'people', title, children, action }) {
  return <div className="empty-state"><span className="empty-icon"><Icon name={icon} size={30} /></span><h3>{title}</h3><p>{children}</p>{action}</div>;
}

export function Toggle({ checked, onChange, label, description, disabled }) {
  const id = useId();
  return <div className="toggle-row"><div><label htmlFor={id}>{label}</label>{description ? <p>{description}</p> : null}</div><button type="button" id={id} className="toggle" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} disabled={disabled}><span /></button></div>;
}
