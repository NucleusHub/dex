import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'

// Browsing is a real hierarchy — series → set → card — so it gets real routes:
// a set is a place you can link someone to, and Back means what it says.
//
// The card detail is the one exception. It opens as an overlay above whatever
// you were browsing (the same pattern as Shelf's book detail), but it's still
// addressable: it's driven by a `?card=<id>` query on the current route, so it
// survives a reload and Back closes it instead of leaving the page.
export default createRouter({
  history: createWebHistory('/dex/'),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/series/:seriesId', name: 'series', component: () => import('@/views/SeriesView.vue') },
    { path: '/sets/:setId', name: 'set', component: () => import('@/views/SetView.vue') },
    { path: '/search', name: 'search', component: () => import('@/views/SearchView.vue') },
    { path: '/binders', name: 'binders', component: () => import('@/views/BindersView.vue') },
    { path: '/binders/:id', name: 'binder', component: () => import('@/views/BinderView.vue') },
    // Anything else lands on the series overview rather than a dead end.
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior(to, from, saved) {
    // Opening/closing the card overlay only changes the query — keep the scroll
    // position so the grid doesn't jump out from under the user.
    if (to.path === from.path) return false
    return saved || { top: 0 }
  },
})
