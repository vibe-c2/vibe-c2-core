import type { CodegenConfig } from "@graphql-codegen/cli"

const config: CodegenConfig = {
  schema: "../core/pkg/graphql/schema/*.graphql",
  documents: "src/graphql/operations/**/*.ts",
  generates: {
    "./src/graphql/gql/": {
      preset: "client",
      config: {
        useTypeImports: true,
        enumsAsTypes: true,
        scalars: {
          ID: "string",
        },
        skipTypename: true,
      },
      presetConfig: {
        fragmentMasking: false,
      },
    },
  },
  ignoreNoDocuments: false,
}

export default config
