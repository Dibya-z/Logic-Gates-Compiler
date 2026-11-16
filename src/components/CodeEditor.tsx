import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import { classHighlighter } from '@lezer/highlight';
import { lintGutter, setDiagnostics } from '@codemirror/lint';
import type { Diagnostic, Span } from '../compiler/types';

const logicLanguage = StreamLanguage.define<{ blockComment: boolean }>({
  startState: () => ({ blockComment: false }),
  token(stream, state) {
    if (state.blockComment) {
      if (stream.skipTo('*/')) { stream.match('*/'); state.blockComment = false; }
      else stream.skipToEnd();
      return 'comment';
    }
    if (stream.eatSpace()) return null;
    if (stream.match('//') || stream.match('#')) { stream.skipToEnd(); return 'comment'; }
    if (stream.match('/*')) { state.blockComment = true; return 'comment'; }
    if (stream.match(/^(input|output|wire)\b/i)) return 'keyword';
    if (stream.match(/^(AND|OR|NOT|XOR|NAND|NOR|XNOR)\b/i) || stream.match(/^[&|^!~]/)) return 'operator';
    if (stream.match(/^[01]\b/)) return 'number';
    if (stream.match(/^[A-Za-z_][A-Za-z0-9_]*/)) return 'variableName';
    stream.next(); return 'punctuation';
  },
});

export interface EditorSelection { span: Span; nonce: number }
interface Props {
  source: string; diagnostics: Diagnostic[]; selection?: EditorSelection;
  onChange: (source: string) => void; onCursor: (offset: number) => void; onCompile: () => void;
}

export function CodeEditor({ source, diagnostics, selection, onChange, onCursor, onCompile }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView | null>(null);
  const callbacks = useRef({ onChange, onCursor, onCompile });
  callbacks.current = { onChange, onCursor, onCompile };
  useEffect(() => {
    if (!host.current) return;
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({ doc: source, extensions: [
        lineNumbers(), history(), drawSelection(), highlightActiveLine(), highlightActiveLineGutter(),
        bracketMatching(), syntaxHighlighting(classHighlighter), logicLanguage, lintGutter(),
        keymap.of([{ key: 'Mod-Enter', run: () => { callbacks.current.onCompile(); return true; } }, ...defaultKeymap, ...historyKeymap, indentWithTab]),
        EditorView.contentAttributes.of({ 'aria-label': 'LogicHDL source code', spellcheck: 'false' }),
        EditorView.updateListener.of(update => {
          if (update.docChanged) callbacks.current.onChange(update.state.doc.toString());
          if (update.selectionSet || update.docChanged) callbacks.current.onCursor(update.state.selection.main.from);
        }),
        EditorView.theme({ '&': { height: '100%', backgroundColor: 'transparent', color: 'var(--text)' },
          '.cm-scroller': { fontFamily: 'var(--mono)', fontSize: '13px', lineHeight: '1.85' },
          '.cm-content': { padding: '22px 0', minHeight: '300px', caretColor: 'var(--accent)' },
          '.cm-line': { padding: '0 18px 0 8px' },
          '.cm-gutters': { background: 'transparent', color: 'var(--muted)', border: 'none', padding: '0 8px 0 14px' },
          '.cm-gutterElement': { padding: '0 4px' },
          '.cm-activeLine, .cm-activeLineGutter': { background: 'var(--hover)' },
          '.cm-cursor': { borderLeftColor: 'var(--accent)' },
          '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { background: 'var(--selection)' },
          '.cm-tooltip': { background: 'var(--surface-raised)', color: 'var(--text)', border: '1px solid var(--border)' },
          '.cm-tooltip-lint': { fontFamily: 'var(--sans)', fontSize: '12px' },
          '.cm-diagnostic': { padding: '8px 12px', lineHeight: '1.6' },
          '&.cm-focused': { outline: 'none' },
        }),
      ] }),
    });
    editor.current = view;
    return () => { view.destroy(); editor.current = null; };
    // The editor owns its state; later props synchronize through transactions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const view = editor.current;
    if (view && source !== view.state.doc.toString()) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: source } });
  }, [source]);
  useEffect(() => {
    const view = editor.current;
    if (!view) return;
    view.dispatch(setDiagnostics(view.state, diagnostics.map(d => ({
      from: Math.min(d.offset, view.state.doc.length),
      to: Math.min(d.offset + Math.max(1, d.length), view.state.doc.length),
      severity: d.severity, message: `${d.code}: ${d.message}\n${d.hint}`,
    }))));
  }, [diagnostics]);
  useEffect(() => {
    const view = editor.current;
    if (!view || !selection) return;
    const from = Math.min(selection.span.offset, view.state.doc.length);
    const to = Math.min(from + selection.span.length, view.state.doc.length);
    view.dispatch({ selection: { anchor: from, head: to }, effects: EditorView.scrollIntoView(from, { y: 'center' }) });
  }, [selection]);
  return <div className="code-editor" ref={host} />;
}
