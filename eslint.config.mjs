import next from "eslint-config-next";

export default [
  ...next,
  {
    rules: {
      // Os componentes carregam dados no useEffect de propósito (sem biblioteca de dados)
      "react-hooks/set-state-in-effect": "off",
      "@next/next/no-img-element": "off",
      // Falso positivo: Date.now() só é chamado dentro de manipuladores de eventos
      "react-hooks/purity": "off",
    },
  },
  { ignores: [".next/**", "node_modules/**", "public/sw.js", "scripts/**"] },
];
