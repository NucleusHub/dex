import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'

export default createRouter({
  history: createWebHistory('/dex/'),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/series/:seriesId', name: 'series', component: () => import('@/views/SeriesView.vue') },
    { path: '/sets/:setId', name: 'set', component: () => import('@/views/SetView.vue') },
    { path: '/search', name: 'search', component: () => import('@/views/SearchView.vue') },
    { path: '/binders', name: 'binders', component: () => import('@/views/BindersView.vue') },
    { path: '/binders/:id', name: 'binder', component: () => import('@/views/BinderView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior(to, from, saved) {
    if (to.path === from.path) return false
    return saved || { top: 0 }
  },
})
