<script setup lang="ts">
const { user, clear } = useUserSession()
const { t } = useI18n()
const localePath = useLocalePath()
const canManage = computed(() => user.value?.role === 'owner' || user.value?.role === 'admin')

async function logout() {
  await clear()
  await navigateTo(localePath('/admin/login'))
}
</script>

<template>
  <div class="admin">
    <header class="admin__bar">
      <NuxtLink :to="localePath('/admin')" class="admin__brand"><span class="cu">CU</span>PHOTO · {{ t('admin.brand').split('·').at(-1)?.trim() }}</NuxtLink>
      <nav class="admin__nav">
        <NuxtLink :to="localePath('/admin')">{{ t('admin.dashboard') }}</NuxtLink>
        <NuxtLink :to="localePath('/admin/albums')">{{ t('admin.albums') }}</NuxtLink>
        <NuxtLink v-if="canManage" :to="localePath('/admin/users')">{{ t('admin.iamTitle') }}</NuxtLink>
        <NuxtLink :to="localePath('/admin/account')">{{ t('admin.account') }}</NuxtLink>
        <NuxtLink :to="localePath('/')" target="_blank">{{ t('admin.viewSite') }}</NuxtLink>
        <button class="admin__logout" @click="logout">{{ t('admin.logOut') }}{{ user ? ` (${(user as { name?: string }).name})` : '' }}</button>
      </nav>
    </header>
    <main class="admin__main">
      <slot />
    </main>
    <AdminUploadDock />
  </div>
</template>

<style scoped>
.admin { min-height: 100vh; background: var(--body-bg); }
.admin__bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 1rem 2rem; background: var(--dark); color: #F5F4F0;
  position: sticky; top: 0; z-index: 50;
}
.admin__brand { font-size: 0.8rem; font-weight: 500; letter-spacing: 0.16em; text-decoration: none; color: #F5F4F0; }
.admin__brand .cu { color: var(--accent); }
.admin__nav { display: flex; align-items: center; gap: 1.5rem; }
.admin__nav a {
  font-size: 0.62rem; letter-spacing: 0.16em; text-transform: uppercase;
  color: rgba(245, 244, 240, 0.6); text-decoration: none; transition: color 0.2s;
}
.admin__nav a:hover { color: #F5F4F0; }
.admin__logout {
  font-family: var(--font-sans); font-size: 0.62rem; letter-spacing: 0.16em; text-transform: uppercase;
  background: none; border: 1px solid rgba(245, 244, 240, 0.25); color: rgba(245, 244, 240, 0.7);
  padding: 0.45rem 0.9rem; cursor: pointer; transition: border-color 0.2s, color 0.2s;
}
.admin__logout:hover { border-color: var(--accent); color: var(--accent); }
.admin__main { padding: 0; }
@media (max-width: 780px) {
  .admin__bar { align-items: flex-start; flex-direction: column; gap: 1rem; }
  .admin__nav { flex-wrap: wrap; gap: 0.75rem 1rem; }
  .admin__main { padding: 2rem 1.25rem 4rem; }
}
</style>
