/* IQUIPAGE theme boot: inline in <head> before the stylesheet. Reads iq-theme / iq-accent / iq-density / iq-motion
   from localStorage, applies data-* on <html> before first paint; theme falls back to the system scheme. */
(function(d,s,k,v){try{s=localStorage}catch(e){s={getItem:function(){}}}
for(k in{theme:0,accent:0,density:0,motion:0}){try{v=s.getItem('iq-'+k)}catch(e){v=null}
if(k=='theme'&&v!='light'&&v!='dark')v=matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light';
if(v)d[k]=v}})(document.documentElement.dataset)
