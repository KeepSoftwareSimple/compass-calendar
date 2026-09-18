import { resolve } from "node:path";

const stubDir = import.meta.dir;
const emptyStyleStub = resolve(stubDir, "empty-style.stub.js");
const fileStub = resolve(stubDir, "file-stub.js");
const svgStub = resolve(stubDir, "svg-stub.tsx");

Bun.plugin({
  name: "web-test-asset-stubs",
  setup(build) {
    build.onResolve({ filter: /\.(css|less)$/ }, () => ({
      path: emptyStyleStub,
    }));

    build.onResolve({ filter: /\.(jpe?g|png|gif)$/i }, () => ({
      path: fileStub,
    }));

    build.onResolve({ filter: /\.svg$/ }, () => ({
      path: svgStub,
    }));
  },
});
