// Self-hosted Instrument Sans for the Crestron panel. Loaded through
// frontend.extra_js_url_es5 because the panel's browser receives Home
// Assistant's legacy build, which never loads extra_module_url scripts.
// Registers each face and forces the download so the first paint is right.
(function () {
  if (!window.FontFace || !document.fonts) return;
  var faces = [
    ["400", "normal", "InstrumentSans-400.woff2"],
    ["400", "italic", "InstrumentSans-400i.woff2"],
    ["500", "normal", "InstrumentSans-500.woff2"],
    ["600", "normal", "InstrumentSans-600.woff2"],
    ["700", "normal", "InstrumentSans-700.woff2"]
  ];
  faces.forEach(function (f) {
    var face = new FontFace("Instrument Sans", "url(/local/fonts/" + f[2] + ") format('woff2')",
      { weight: f[0], style: f[1], display: "swap" });
    document.fonts.add(face);
    face.load().catch(function (e) { console.warn("panel-fonts: " + f[2], e); });
  });
})();
