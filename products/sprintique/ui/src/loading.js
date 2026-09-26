import {escapeHTML as esc} from '@iquipage/web/core';
/** One loading look for the product: DS skeletons inside .iq-loading, which stays invisible for the first 180ms. */
export function loadingMarkup(label,{rows=4,title=false,className=''}={}){
  return `<div class="iq-loading product-loading ${className}" role="status" aria-busy="true"><span class="sr-only">${esc(label)}</span>${title?'<div class="iq-skeleton product-loading-title"></div>':''}${'<div class="iq-skeleton product-loading-row"></div>'.repeat(rows)}</div>`;
}
