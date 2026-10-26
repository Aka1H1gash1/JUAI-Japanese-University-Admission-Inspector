export default {
  extends: ['@vben/stylelint-config'],
  root: true,
  overrides: [
    {
      // These files are consumed by Vue's <style scoped src="..."> compiler.
      files: [
        'apps/web-antd/src/views/japan-grad/welcome.css',
        'apps/web-antd/src/views/japan-grad/university-list-compact.css',
      ],
      rules: {
        'selector-pseudo-class-no-unknown': [
          true,
          { ignorePseudoClasses: ['deep'] },
        ],
      },
    },
  ],
};
