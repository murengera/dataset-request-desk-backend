from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .views import UserViewSet, login_view, me_view, register_view

router = DefaultRouter()
router.register(r"", UserViewSet, basename="user")

urlpatterns = [
    path("auth/register/", register_view, name="register"),
    path("auth/login/", login_view, name="login"),
    path("auth/me/", me_view, name="me"),
    path("users/", include(router.urls)),
]
