const path = require("path");

module.exports = {
  webpack: {
    alias: {
      "@features": path.resolve(__dirname, "src/features"),
      "@services": path.resolve(__dirname, "src/services"),
      "@types": path.resolve(__dirname, "src/types"),
      "@root": path.resolve(__dirname, "src"),
    },
  },
  // 让 Jest 认识 tsconfig 里的 @features / @services / @types / @root 别名，
  // 否则引用了别名的组件没法写单元测试（webpack 的 alias 不作用于 Jest）。
  jest: {
    configure: {
      moduleNameMapper: {
        "^@features/(.*)$": "<rootDir>/src/features/$1",
        "^@features$": "<rootDir>/src/features",
        "^@services/(.*)$": "<rootDir>/src/services/$1",
        "^@services$": "<rootDir>/src/services",
        "^@types/(.*)$": "<rootDir>/src/types/$1",
        "^@types$": "<rootDir>/src/types",
        "^@root/(.*)$": "<rootDir>/src/$1",
        "^@root$": "<rootDir>/src",
      },
    },
  },
};
