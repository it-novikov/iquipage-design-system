/** The identity provider renders the shared IQUIPAGE credential dialog. */
export function mountAuthScreen(root){
  const match=location.hash.match(/^#invite\/(invite_[A-Za-z0-9_-]{43})$/);
  if(match)sessionStorage.setItem('sprintique.pending-invitation',match[1]);
  root.innerHTML='<main class="iq-auth-stage"><section class="iq-auth-dialog"><h1>Вход в Sprintique</h1><p role="status" class="iq-auth-dialog-description">Открываем форму входа…</p><a class="iq-btn primary" href="/auth/login">Открыть форму входа</a></section></main>';
  location.replace('/auth/login');
}
