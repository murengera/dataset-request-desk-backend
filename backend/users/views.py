from django.contrib.auth import authenticate, get_user_model
from rest_framework import status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .permissions import IsAdminUser
from .serializers import LoginSerializer, RegisterSerializer, UserSerializer

User = get_user_model()


@api_view(["POST"])
@permission_classes([AllowAny])
def register_view(request):
    """
    Public registration endpoint for new clients.
    Returns auth token and client user profile upon successful registration.
    """
    serializer = RegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.save()

    token, _ = Token.objects.get_or_create(user=user)

    return Response(
        {
            "token": token.key,
            "user": {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "role": user.role,
                "organisation": user.organisation,
                "name": f"{user.first_name} {user.last_name}".strip(),
            },
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def login_view(request):
    """
    Authenticate with username or email + password.
    Returns auth token and user profile info.
    """
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    username_or_email = serializer.validated_data["username_or_email"].strip()
    password = serializer.validated_data["password"]

    # Try authentication directly with username
    user = authenticate(request, username=username_or_email, password=password)

    # If failed, try finding user by email
    if user is None:
        try:
            found_user = User.objects.get(email__iexact=username_or_email)
            user = authenticate(request, username=found_user.username, password=password)
        except User.DoesNotExist:
            user = None

    if user is None or not user.is_active:
        return Response(
            {"error": "Invalid username/email or password."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    token, _ = Token.objects.get_or_create(user=user)

    return Response({
        "token": token.key,
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role,
            "organisation": user.organisation,
            "name": f"{user.first_name} {user.last_name}".strip(),
        },
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me_view(request):
    """Returns profile info of currently logged-in user."""
    user = request.user
    return Response({
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "role": user.role,
        "organisation": user.organisation,
        "name": f"{user.first_name} {user.last_name}".strip(),
    })


class UserViewSet(viewsets.ModelViewSet):
    """
    Admin-only ViewSet to list, create, update (role, active state), or deactivate users.
    """
    queryset = User.objects.all().order_by("id")
    serializer_class = UserSerializer
    permission_classes = [IsAdminUser]
