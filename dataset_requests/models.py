from django.conf import settings
from django.db import models
from django.db.models import CheckConstraint, Q


class Request(models.Model):
    class Status(models.TextChoices):
        SUBMITTED = "submitted", "Submitted"
        IN_PROGRESS = "in_progress", "In Progress"
        DELIVERED = "delivered", "Delivered"
        ACCEPTED = "accepted", "Accepted"
        REJECTED = "rejected", "Rejected"

    client = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="requests",
    )
    task_name = models.CharField(max_length=255, db_index=True)
    episodes_requested = models.PositiveIntegerField()
    deadline = models.DateField()
    notes = models.TextField(blank=True, default="")
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.SUBMITTED,
        db_index=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            CheckConstraint(
                check=Q(episodes_requested__gt=0),
                name="request_episodes_requested_gt_zero",
            )
        ]

    def __str__(self):
        return f"Request #{self.pk} - {self.task_name} ({self.status}) by {self.client.username}"


class Assignment(models.Model):
    request = models.ForeignKey(
        Request,
        on_delete=models.CASCADE,
        related_name="assignments",
    )
    episode = models.OneToOneField(
        "episodes.Episode",
        on_delete=models.CASCADE,
        related_name="assignment",
    )
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="assigned_episodes",
    )
    assigned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-assigned_at"]

    def __str__(self):
        return f"Assignment: Episode {self.episode.episode_id} -> Request #{self.request_id}"


class RequestStatusHistory(models.Model):
    request = models.ForeignKey(
        Request,
        on_delete=models.CASCADE,
        related_name="status_history",
    )
    old_status = models.CharField(
        max_length=20,
        choices=Request.Status.choices,
        null=True,
        blank=True,
    )
    new_status = models.CharField(
        max_length=20,
        choices=Request.Status.choices,
    )
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="status_changes",
    )
    changed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-changed_at"]
        verbose_name_plural = "Request status histories"

    def __str__(self):
        return f"Request #{self.request_id}: {self.old_status} -> {self.new_status} by {self.changed_by.username} at {self.changed_at}"
