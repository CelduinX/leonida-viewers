// Runs synchronously before CSS: restore the theme without a light/dark flash.
interface Window {
  LeonidaTheme?: { toggle(): void; set(value: 'light'|'dark'|'system'): void; mode(): 'light'|'dark'|'system' };
}
(() => {
  const key = 'leonida-viewers.theme';
  const system = matchMedia('(prefers-color-scheme: dark)');
  let selected: 'light'|'dark'|'system' = 'system';
  function stored(): 'light'|'dark'|'system' {
    try { const value=localStorage.getItem(key); return value==='light'||value==='dark'?value:'system'; }
    catch { return 'system'; }
  }
  function apply() {
    const dark=selected==='dark'||(selected==='system'&&system.matches);
    document.documentElement.dataset.theme=dark?'dark':'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark?'#101117':'#F7F7FA');
    document.querySelectorAll<HTMLButtonElement>('[data-action="theme"]').forEach(button=>{
      const label=dark?'Helles Design aktivieren':'Dunkles Design aktivieren';
      button.setAttribute('aria-label',label);button.title=label;button.setAttribute('aria-pressed',String(dark));
      const text=button.querySelector('[data-theme-label]');if(text)text.textContent=dark?'Dark Mode':'White Mode';
    });
    document.querySelectorAll<HTMLElement>('[data-theme-option]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.themeOption===selected)));
    document.dispatchEvent(new CustomEvent('leonida:themechange'));
  }
  function set(value:'light'|'dark'|'system') {
    selected=value;
    try { if(value==='system')localStorage.removeItem(key);else localStorage.setItem(key,value); } catch { /* In-memory selection still works. */ }
    apply();
  }
  selected=stored();apply();
  window.LeonidaTheme={set,mode:()=>selected,toggle:()=>set(document.documentElement.dataset.theme==='dark'?'light':'dark')};
  document.addEventListener('DOMContentLoaded',apply,{once:true});
  system.addEventListener('change',()=>{if(selected==='system')apply();});
  addEventListener('storage',event=>{if(event.key===key||event.key===null){selected=stored();apply();}});
})();
