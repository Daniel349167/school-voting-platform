<template>
  <div class="login-wrapper">
    <div class="login-card">
      <h1>🧑‍🏫 Votación Escolar</h1>
      <p style="color:#777;margin-bottom:1rem;">Inicio de sesión del docente</p>

      <form @submit.prevent="login">
        <input
          v-model="email"
          type="email"
          placeholder="Correo institucional"
          required
        />
        <input
          v-model="password"
          type="password"
          placeholder="Contraseña"
          required
        />

        <p v-if="error" class="error">{{ error }}</p>

        <button type="submit" :disabled="loading">
          {{ loading ? "Ingresando..." : "Ingresar" }}
        </button>
      </form>

      <div class="school-footer">
        <p>© 2025 Colegio Nacional - Sistema de Votación</p>
      </div>
      <!-- Link público a resultados en tiempo real -->
      <div class="public-results">
        <NuxtLink to="/resultados" class="btn ghost wide">
          📊 Ver resultados en tiempo real
        </NuxtLink>
      </div>


      
    </div>
  </div>
</template>

<script setup lang="ts">
const router = useRouter()
const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

const login = async () => {
  error.value = ''
  loading.value = true
  const res = await $fetch('/api/login', { method:'POST', body:{ email: email.value, password: password.value } })
    .catch(() => ({ ok:false, msg:'Error de servidor' }))
  loading.value = false

  if (!res?.ok) { error.value = res?.msg || 'No se pudo ingresar'; return }

  if (res.role === 'docente') router.push('/docente')
  else if (res.role === 'aperturador') router.push('/votar')
  else router.push('/')
}
</script>

<style>
.public-results{ margin-top: 12px; text-align:center; }
.btn.ghost.wide{
  display:inline-block; width:100%;
  background:#eef2ff; color:#1e293b; border:1px solid #c7d2fe;
  padding:10px 14px; border-radius:10px; font-weight:700; text-decoration:none;
}
.btn.ghost.wide:hover{ filter:brightness(0.98); transform:translateY(-1px); }


</style>
