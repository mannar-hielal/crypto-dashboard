/**
 * The public pages' header links (owner's visual Q&A 2026-11-18), beside the logo in the marketing
 * `TopBar`: Product ▾ (Chart, Crypto path), How it works, Blog, About and Support. From md up they are text links
 * with a dropdown panel; below it one menu button opens a full-width sheet (rows of 44 px). Esc and a
 * click outside close what is open, and a link closes it too. The dashboard's bar has no nav.
 */

import { useEffect, useRef, useState, type RefObject } from 'react';
import { ChevronDown, Menu, X } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { guide } from '@/lib/guideAnchors';
import styles from './SiteNav.module.css';

const PRODUCT = [
  { to: '/chart', key: 'chart', name: 'Chart', text: 'Live candles and indicators' },
  { to: '/path', key: 'path', name: 'Crypto path', text: 'Your lessons, step by step' },
] as const;

const LINKS = [
  { to: '/how-it-works', label: 'How it works', anchor: 'nav.how' },
  { to: '/blog', label: 'Blog', anchor: 'nav.blog' },
  { to: '/about', label: 'About', anchor: 'nav.about' },
  { to: '/support', label: 'Support', anchor: 'nav.support' },
] as const;

/** Close what is open on Esc (focus returns to `back`) and on a press outside `inside` */
function useDismiss(
  open: boolean,
  close: () => void,
  inside: RefObject<HTMLElement | null>,
  back: RefObject<HTMLElement | null>
) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      close();
      back.current?.focus();
    };
    const onPress = (e: MouseEvent) => {
      if (inside.current && !inside.current.contains(e.target as Node)) close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPress);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPress);
    };
  }, [open, close, inside, back]);
}

export function SiteNav() {
  const { pathname } = useLocation();
  const [productOpen, setProductOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [phoneProduct, setPhoneProduct] = useState(false);
  const productRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeProduct = () => setProductOpen(false);
  const closeMenu = () => setMenuOpen(false);
  useDismiss(productOpen, closeProduct, productRef, triggerRef);
  useDismiss(menuOpen, closeMenu, navRef, menuButtonRef);

  const inProduct = PRODUCT.some((p) => pathname === p.to);
  const isCurrent = (to: string) => pathname === to || pathname.startsWith(`${to}/`);

  return (
    <div ref={navRef} className="contents">
      {/* ── md and up: text links ───────────────────────────────────────── */}
      <nav className={styles.nav} aria-label="Main">
        <div ref={productRef} className={styles.product}>
          <button
            ref={triggerRef}
            type="button"
            className={`${styles.trigger}${inProduct ? ` ${styles.current}` : ''}`}
            aria-expanded={productOpen}
            aria-controls="site-nav-product"
            onClick={() => setProductOpen((o) => !o)}
            {...guide('nav.product')}
          >
            Product
            <ChevronDown
              size={14}
              aria-hidden="true"
              className={`${styles.chevron}${productOpen ? ` ${styles.chevronOpen}` : ''}`}
            />
          </button>
          {productOpen && (
            <ul id="site-nav-product" className={styles.panel}>
              {PRODUCT.map((p) => (
                <li key={p.to}>
                  <Link
                    to={p.to}
                    className={styles.item}
                    onClick={closeProduct}
                    {...guide('nav.product.item', p.key)}
                  >
                    <span className={styles.itemName}>{p.name}</span>
                    <span className={styles.itemText}>{p.text}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        {LINKS.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className={`${styles.link}${isCurrent(l.to) ? ` ${styles.current}` : ''}`}
            aria-current={isCurrent(l.to) ? 'page' : undefined}
            {...guide(l.anchor)}
          >
            {l.label}
          </Link>
        ))}
      </nav>

      {/* ── Below md: a menu button and its sheet ───────────────────────── */}
      <button
        ref={menuButtonRef}
        type="button"
        className={styles.menuButton}
        aria-label={menuOpen ? 'Close the menu' : 'Open the menu'}
        aria-expanded={menuOpen}
        aria-controls="site-nav-sheet"
        onClick={() => setMenuOpen((o) => !o)}
        {...guide('nav.menu')}
      >
        {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
      </button>
      {menuOpen && (
        <nav
          id="site-nav-sheet"
          className={styles.sheet}
          aria-label="Main"
          {...guide('nav.menu.sheet')}
        >
          <button
            type="button"
            className={styles.row}
            aria-expanded={phoneProduct}
            onClick={() => setPhoneProduct((o) => !o)}
            {...guide('nav.product')}
          >
            Product
            <ChevronDown
              size={16}
              aria-hidden="true"
              className={`${styles.chevron}${phoneProduct ? ` ${styles.chevronOpen}` : ''}`}
            />
          </button>
          {phoneProduct &&
            PRODUCT.map((p) => (
              <Link
                key={p.to}
                to={p.to}
                className={`${styles.row} ${styles.sub}`}
                onClick={closeMenu}
                {...guide('nav.product.item', p.key)}
              >
                {p.name}
              </Link>
            ))}
          {LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={styles.row}
              aria-current={isCurrent(l.to) ? 'page' : undefined}
              onClick={closeMenu}
              {...guide(l.anchor)}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
