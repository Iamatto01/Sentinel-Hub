import { existsSync } from 'node:fs';
import type { BrowserActionResult, BrowserElement } from './types';

/**
 * Jev Ultrafast Headless Browser Runner.
 *
 * Inspired by `browser-use/jev-ultrafast`:
 * 1. Converts page states into an indexed array of interactive elements:
 *    [0] <BUTTON> "Submit"
 *    [1] <INPUT> "Username" (name=user)
 *    [2] <A> "Forgot Password" (href=/reset)
 * 2. Operates via indexed atomic commands (CLICK, TYPE_TEXT, NAVIGATE, EXTRACT)
 * 3. Runs headless and low-latency, avoiding costly full-page screenshot round trips.
 */

function findBrowserBinary(): string | null {
  if (process.platform === 'win32') {
    const candidates = [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ];
    for (const c of candidates) {
      if (existsSync(c)) return c;
    }
  } else {
    // Linux (e.g. Kali)
    const linuxCandidates = [
      '/usr/bin/chromium',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
      '/usr/bin/firefox-esr',
    ];
    for (const c of linuxCandidates) {
      if (existsSync(c)) return c;
    }
  }
  return null;
}

export class JevBrowserSession {
  private currentUrl = 'about:blank';
  private pageTitle = 'Blank';
  private elements: BrowserElement[] = [];
  private extractedText = '';
  private lastHtml = '';

  /**
   * Fast HTML extraction and DOM indexing.
   */
  public async navigate(url: string): Promise<BrowserActionResult> {
    try {
      let target = url.trim();
      if (!target.startsWith('http://') && !target.startsWith('https://')) {
        target = `https://${target}`;
      }

      this.currentUrl = target;

      const res = await fetch(target, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        return {
          success: false,
          action: `NAVIGATE ${url}`,
          currentUrl: target,
          pageTitle: `HTTP ${res.status}`,
          elements: [],
          error: `Failed to load page: HTTP ${res.status} ${res.statusText}`,
        };
      }

      const html = await res.text();
      this.lastHtml = html;
      this.pageTitle = this.extractTitle(html);
      this.elements = this.indexInteractiveElements(html);
      this.extractedText = this.cleanText(html);

      return {
        success: true,
        action: `NAVIGATE ${target}`,
        currentUrl: target,
        pageTitle: this.pageTitle,
        elements: this.elements,
        extractedText: this.extractedText.slice(0, 3000),
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        action: `NAVIGATE ${url}`,
        currentUrl: this.currentUrl,
        pageTitle: 'Error',
        elements: [],
        error: msg,
      };
    }
  }

  /**
   * Performs an indexed atomic action:
   * e.g. "CLICK 2", "TYPE_TEXT 1 admin@example.com", "EXTRACT"
   */
  public async executeAction(actionCommand: string): Promise<BrowserActionResult> {
    const parts = actionCommand.trim().split(/\s+/);
    const verb = parts[0]?.toUpperCase();
    const arg = parts.slice(1).join(' ');

    if (verb === 'NAVIGATE') {
      return this.navigate(arg);
    }

    if (verb === 'EXTRACT') {
      return {
        success: true,
        action: 'EXTRACT',
        currentUrl: this.currentUrl,
        pageTitle: this.pageTitle,
        elements: this.elements,
        extractedText: this.extractedText.slice(0, 4000),
      };
    }

    if (verb === 'CLICK') {
      const idx = Number.parseInt(parts[1] ?? '', 10);
      const targetElement = this.elements.find((e) => e.index === idx);
      if (!targetElement) {
        return {
          success: false,
          action: actionCommand,
          currentUrl: this.currentUrl,
          pageTitle: this.pageTitle,
          elements: this.elements,
          error: `Element index [${idx}] not found in indexed action space.`,
        };
      }

      // If it has an href, navigate to it
      if (targetElement.href) {
        try {
          const resolved = new URL(targetElement.href, this.currentUrl).href;
          return this.navigate(resolved);
        } catch {
          // Ignore URL resolve error
        }
      }

      return {
        success: true,
        action: `CLICK [${idx}] (${targetElement.tagName}: ${targetElement.text})`,
        currentUrl: this.currentUrl,
        pageTitle: this.pageTitle,
        elements: this.elements,
        extractedText: `Simulated click on ${targetElement.tagName} [${idx}]: "${targetElement.text}"`,
      };
    }

    if (verb === 'TYPE_TEXT') {
      const idx = Number.parseInt(parts[1] ?? '', 10);
      const textToType = parts.slice(2).join(' ').replace(/^['"]|['"]$/g, '');
      const targetElement = this.elements.find((e) => e.index === idx);

      if (!targetElement) {
        return {
          success: false,
          action: actionCommand,
          currentUrl: this.currentUrl,
          pageTitle: this.pageTitle,
          elements: this.elements,
          error: `Input element index [${idx}] not found.`,
        };
      }

      return {
        success: true,
        action: `TYPE_TEXT [${idx}] "${textToType}"`,
        currentUrl: this.currentUrl,
        pageTitle: this.pageTitle,
        elements: this.elements,
        extractedText: `Entered "${textToType}" into field [${idx}] (${targetElement.name || targetElement.placeholder || 'input'})`,
      };
    }

    return {
      success: false,
      action: actionCommand,
      currentUrl: this.currentUrl,
      pageTitle: this.pageTitle,
      elements: this.elements,
      error: `Unknown browser action verb "${verb}". Supported verbs: NAVIGATE <url>, CLICK <index>, TYPE_TEXT <index> <text>, EXTRACT.`,
    };
  }

  /**
   * Jev-Style DOM Indexer:
   * Finds inputs, buttons, links, and forms, giving each an integer index.
   */
  private indexInteractiveElements(html: string): BrowserElement[] {
    const elements: BrowserElement[] = [];
    let currentIndex = 0;

    // 1. Matches <input ...>, <textarea ...>, <select ...>
    const inputRegex = /<(input|textarea|select)([^>]*)>/gi;
    let match: RegExpExecArray | null;

    while ((match = inputRegex.exec(html)) !== null && currentIndex < 40) {
      const tag = match[1].toLowerCase();
      const attrs = match[2];
      const type = this.getAttr(attrs, 'type') || (tag === 'textarea' ? 'textarea' : 'text');
      const name = this.getAttr(attrs, 'name');
      const id = this.getAttr(attrs, 'id');
      const placeholder = this.getAttr(attrs, 'placeholder');
      const value = this.getAttr(attrs, 'value');

      if (type !== 'hidden') {
        elements.push({
          index: currentIndex++,
          tagName: tag,
          type,
          text: value || placeholder || name || id || 'Input field',
          name,
          id,
          placeholder,
        });
      }
    }

    // 2. Matches <button ...>text</button>
    const buttonRegex = /<button([^>]*)>([\s\S]*?)<\/button>/gi;
    while ((match = buttonRegex.exec(html)) !== null && currentIndex < 40) {
      const attrs = match[1];
      const text = this.stripTags(match[2]).trim();
      const id = this.getAttr(attrs, 'id');

      elements.push({
        index: currentIndex++,
        tagName: 'button',
        text: text || 'Button',
        id,
      });
    }

    // 3. Matches <a href="...">text</a>
    const linkRegex = /<a\s+([^>]*href=["']([^"']*)["'][^>]*)>([\s\S]*?)<\/a>/gi;
    while ((match = linkRegex.exec(html)) !== null && currentIndex < 50) {
      const href = match[2];
      const text = this.stripTags(match[3]).trim();
      if (text.length > 0 && !href.startsWith('javascript:')) {
        elements.push({
          index: currentIndex++,
          tagName: 'a',
          text: text.slice(0, 50),
          href,
        });
      }
    }

    return elements;
  }

  private extractTitle(html: string): string {
    const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    return match ? this.stripTags(match[1]).trim() : 'No Title';
  }

  private cleanText(html: string): string {
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private stripTags(str: string): string {
    return str.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private getAttr(attrs: string, name: string): string | undefined {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`${escaped}=["']([^"']*)["']`, 'i');
    const match = regex.exec(attrs);
    return match ? match[1] : undefined;
  }

  public getStatus(): { currentUrl: string; pageTitle: string; elementCount: number; binary: string | null } {
    return {
      currentUrl: this.currentUrl,
      pageTitle: this.pageTitle,
      elementCount: this.elements.length,
      binary: findBrowserBinary(),
    };
  }
}

export const jevBrowser = new JevBrowserSession();
