from django.db import models


class Episode(models.Model):
    class Quality(models.TextChoices):
        GOOD = "good", "Good"
        USABLE = "usable", "Usable"
        BAD = "bad", "Bad"

    episode_id = models.CharField(max_length=64, unique=True)
    robot_id = models.CharField(max_length=64, db_index=True)
    task_name = models.CharField(max_length=255, db_index=True)
    recorded_at = models.DateTimeField(db_index=True)
    duration_seconds = models.PositiveIntegerField()
    operator_name = models.CharField(max_length=255)
    quality = models.CharField(
        max_length=10,
        choices=Quality.choices,
        db_index=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-recorded_at"]

    def __str__(self):
        return f"{self.episode_id} - {self.task_name} ({self.quality})"
