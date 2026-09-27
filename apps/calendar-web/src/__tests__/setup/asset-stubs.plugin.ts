Bun.plugin({
  name: "web-test-asset-stubs",
  setup(build) {
    build.onResolve({ filter: /\.(css|less)$/ }, () => ({
      path: "virtual:web-test-empty-style",
      namespace: "web-test-stub",
    }));

    build.onResolve({ filter: /\.(jpe?g|png|gif)$/i }, () => ({
      path: "virtual:web-test-file-stub",
      namespace: "web-test-stub",
    }));

    build.onResolve({ filter: /\.svg$/ }, () => ({
      path: "virtual:web-test-svg-stub",
      namespace: "web-test-stub",
    }));

    build.onLoad({ filter: /.*/, namespace: "web-test-stub" }, (args) => {
      if (args.path === "virtual:web-test-empty-style") {
        return { contents: "export default {};", loader: "js" };
      }

      if (args.path === "virtual:web-test-file-stub") {
        return { contents: 'export default "test-file-stub";', loader: "js" };
      }

      if (args.path === "virtual:web-test-svg-stub") {
        return {
          contents: `
import { createElement, forwardRef } from "react";
const SvgrMock = forwardRef((props, ref) => createElement("span", { ref, ...props }));
SvgrMock.displayName = "SvgrMock";
export const ReactComponent = SvgrMock;
export default SvgrMock;
`,
          loader: "tsx",
        };
      }
    });
  },
});
