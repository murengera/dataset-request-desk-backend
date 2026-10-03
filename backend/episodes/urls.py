from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .views import EpisodeViewSet

router = DefaultRouter()
router.register(r"", EpisodeViewSet, basename="episode")

urlpatterns = [
    path("", include(router.urls)),
]
