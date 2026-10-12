import type { RouteRecordRaw } from 'vue-router';

import { LOGIN_PATH } from '@vben/constants';
import { preferences } from '@vben/preferences';

import { $t } from '#/locales';

const BasicLayout = () => import('#/layouts/basic.vue');
const AuthPageLayout = () => import('#/layouts/auth.vue');
/** 全局404页面 */
const fallbackNotFoundRoute: RouteRecordRaw = {
  component: () => import('#/views/_core/fallback/not-found.vue'),
  meta: {
    hideInBreadcrumb: true,
    hideInMenu: true,
    hideInTab: true,
    title: '404',
  },
  name: 'FallbackNotFound',
  path: '/:path(.*)*',
};

/** 基本路由，这些路由是必须存在的 */
const coreRoutes: RouteRecordRaw[] = [
  /**
   * 根路由
   * 使用基础布局，作为所有页面的父级容器，子级就不必配置BasicLayout。
   * 此路由必须存在，且不应修改
   */
  {
    component: BasicLayout,
    meta: {
      hideInBreadcrumb: true,
      title: 'Root',
    },
    name: 'Root',
    path: '/',
    redirect: preferences.app.defaultHomePath,
    children: [],
  },
  {
    name: 'JapanGrad',
    path: '/japan-grad',
    component: () => import('#/views/japan-grad/layout.vue'),
    meta: { title: '大学选择与对比' },
    children: [
      {
        name: 'UniversityList',
        path: '',
        component: () => import('#/views/japan-grad/index.vue'),
        meta: {
          title: '大学选择与对比',
        },
      },
      {
        name: 'ExamJourney',
        path: 'journey',
        component: () => import('#/views/japan-grad/journey.vue'),
        meta: { title: '修考之路' },
      },
      {
        name: 'AdmissionCycleDetails',
        path: 'admissions/:cycleId',
        component: () => import('#/views/japan-grad/admission-cycle.vue'),
        meta: { title: '申请轮次 · 募集要项分析' },
      },
      {
        name: 'UniversityDetails',
        path: 'universities/:universityId',
        component: () => import('#/views/japan-grad/university.vue'),
        meta: { title: '大学 · 研究科' },
      },
      {
        name: 'GraduateSchoolDetails',
        path: 'universities/:universityId/schools/:schoolId',
        component: () => import('#/views/japan-grad/school.vue'),
        meta: { title: '研究科 · 专攻' },
      },
      {
        name: 'MajorDetails',
        path: 'universities/:universityId/schools/:schoolId/majors/:majorId',
        component: () => import('#/views/japan-grad/major.vue'),
        meta: { title: '专攻 · 研究室' },
      },
      {
        name: 'ResearchLabDetails',
        path: 'universities/:universityId/schools/:schoolId/majors/:majorId/labs/:labId',
        component: () => import('#/views/japan-grad/research-lab.vue'),
        meta: { title: '研究室 · 资料与老师' },
      },
      {
        name: 'LabProfessorDetails',
        path: 'universities/:universityId/schools/:schoolId/majors/:majorId/labs/:labId/professors/:professorId',
        component: () => import('#/views/japan-grad/professor.vue'),
        meta: { title: '老师 · 资料与研究' },
      },
      {
        name: 'ProfessorDetails',
        path: 'universities/:universityId/schools/:schoolId/majors/:majorId/professors/:professorId',
        component: () => import('#/views/japan-grad/professor.vue'),
        meta: { title: '老师 · 资料与研究' },
      },
    ],
  },
  {
    component: AuthPageLayout,
    meta: {
      hideInTab: true,
      title: 'Authentication',
    },
    name: 'Authentication',
    path: '/auth',
    redirect: LOGIN_PATH,
    children: [
      {
        name: 'Login',
        path: 'login',
        component: () => import('#/views/_core/authentication/login.vue'),
        meta: {
          title: $t('page.auth.login'),
        },
      },
      {
        name: 'CodeLogin',
        path: 'code-login',
        component: () => import('#/views/_core/authentication/code-login.vue'),
        meta: {
          title: $t('page.auth.codeLogin'),
        },
      },
      {
        name: 'QrCodeLogin',
        path: 'qrcode-login',
        component: () =>
          import('#/views/_core/authentication/qrcode-login.vue'),
        meta: {
          title: $t('page.auth.qrcodeLogin'),
        },
      },
      {
        name: 'ForgetPassword',
        path: 'forget-password',
        component: () =>
          import('#/views/_core/authentication/forget-password.vue'),
        meta: {
          title: $t('page.auth.forgetPassword'),
        },
      },
      {
        name: 'Register',
        path: 'register',
        component: () => import('#/views/_core/authentication/register.vue'),
        meta: {
          title: $t('page.auth.register'),
        },
      },
    ],
  },
];

export { coreRoutes, fallbackNotFoundRoute };
