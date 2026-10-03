from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .views import RequestViewSet, analytics_view

router = DefaultRouter()
router.register(r"", RequestViewSet, basename="request")

urlpatterns = [
    path("analytics/", analytics_view, name="analytics"),
    path("", include(router.urls)),
]
