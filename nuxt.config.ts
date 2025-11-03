// nuxt.config.ts
export default defineNuxtConfig({
  devtools: { enabled: false },
  css: ['@/assets/styles/main.css'], 
  modules: [],
  runtimeConfig: {
    PUBLIC_RESULT_BLOCK: process.env.PUBLIC_RESULT_BLOCK, 
    supabaseServiceRole: process.env.SUPABASE_SERVICE_ROLE,
    public: {
      PUBLIC_RESULT_BLOCK: process.env.PUBLIC_RESULT_BLOCK, 
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseKey: process.env.SUPABASE_KEY,
    },
  },
})
