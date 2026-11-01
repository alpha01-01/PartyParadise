import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  ...nextVitals,
  {
    // New in eslint-config-next 16. Existing code breaks these in many places,
    // so they warn until that clean-up is done (see CODEBASE_AUDIT.md).
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
      "react/no-unescaped-entities": "warn",
    },
  },
  { ignores: [".next/**", "next-env.d.ts"] },
];

export default eslintConfig;
