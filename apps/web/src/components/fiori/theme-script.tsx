/** Setzt das gespeicherte Theme vor dem ersten Paint (kein Flash). Wird im <head> gerendert. */
export function ThemeScript() {
  const js = `try{var t=localStorage.getItem('zv-theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t);}catch(e){}`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
