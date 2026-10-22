// ComfyJS llega como global desde la etiqueta del CDN en overlay.html.
// Sus comandos empiezan por "!", asi que "onCommand" recibe la palabra sin
// el signo: "!mario hola" -> command "mario", message "hola".
export function startChat({ channel, onCommand, onStatus }) {
  const ComfyJS = window.ComfyJS;
  if (!ComfyJS) {
    console.error('[chat] comfy.js failed to load');
    onStatus?.('error: comfy.js failed to load');
    return null;
  }

  ComfyJS.onConnected = () => {
    console.log(`[chat] connected to #${channel}`);
    onStatus?.('connected');
  };

  ComfyJS.onError = (err) => {
    console.error('[chat]', err?.message ?? err);
    onStatus?.(`error: ${err?.message ?? err}`);
  };

  ComfyJS.onCommand = (user, command, message, flags) => {
    onCommand?.({
      user: String(user ?? ''),
      command: String(command ?? '').trim().toLowerCase(),
      text: String(message ?? ''),
      flags: flags ?? {},
    });
  };

  ComfyJS.Init(channel, null, null, false);
  return ComfyJS;
}
