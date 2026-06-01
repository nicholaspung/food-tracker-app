import { Ionicons } from '../../ui/AppIcon';
import { Pressable, View } from 'react-native';

import {
  CachedRemoteImage,
  ExpandableText,
  StatusPill,
} from '../../components/shared';
import type { NoteOverviewItemRecord } from '../../features';
import { buildPhotoThumbnailUrl } from '../../lib/photoUrls';
import { useTheme } from '../../theme';
import { Card, Text } from '../../ui';
import { formatTimeAgo } from './notesFormatters';
import { buildNotePreview } from './notesSearch';

interface NoteCardProps {
  note: NoteOverviewItemRecord;
  loadingPhotoNoteId: string | null;
  onDelete: (note: NoteOverviewItemRecord) => void;
  onEdit: (note: NoteOverviewItemRecord) => void;
  onOpenPhotos: (note: NoteOverviewItemRecord) => void;
  onUse: (note: NoteOverviewItemRecord) => void;
  styles: {
    noteTopRow: object;
    noteMeta: object;
    noteActionsInline: object;
    useActionLabel: object;
    iconAction: object;
    noteContentRow: object;
    photoWrap: object;
    photoWrapLoading: object;
    photoThumb: object;
    photoCountBadge: object;
    photoCountText: object;
    noteTextContent: object;
    notePreviewTapTarget: object;
    locationRow: object;
    locationText: object;
  };
}

export function NoteCard({
  loadingPhotoNoteId,
  note,
  onDelete,
  onEdit,
  onOpenPhotos,
  onUse,
  styles,
}: NoteCardProps) {
  const theme = useTheme();
  const photoPreview = note.photoPreview;
  const extraPhotoCount = photoPreview ? Math.max(photoPreview.count - 1, 0) : 0;
  const thumbnailUrl = photoPreview
    ? buildPhotoThumbnailUrl(photoPreview, { collectionName: 'note_photos' })
    : null;

  return (
    <Card tone={note.status === 'used' ? 'default' : 'info'}>
      <View style={styles.noteTopRow}>
        <View style={styles.noteMeta}>
          <Ionicons color={theme.colors.text.muted} name="document-text-outline" size={14} />
          <Text tone="muted" variant="bodySm">
            {formatTimeAgo(note.createdAt)}
          </Text>
          {note.status === 'used' ? <StatusPill label="Used" tone="success" /> : null}
        </View>

        <View style={styles.noteActionsInline}>
          {note.status === 'draft' ? (
            <Pressable
              accessibilityLabel="Use note"
              accessibilityRole="button"
              onPress={() => {
                onUse(note);
              }}
              testID={`note-use-button-${note.id}`}
            >
              <Text style={styles.useActionLabel} variant="bodyBaseSemiBold">Use</Text>
            </Pressable>
          ) : null}

          <Pressable
            accessibilityLabel="Edit note"
            accessibilityRole="button"
            onPress={() => {
              onEdit(note);
            }}
            style={styles.iconAction}
            testID={`note-edit-button-${note.id}`}
          >
            <Ionicons color={theme.colors.text.primary} name="create-outline" size={18} />
          </Pressable>

          <Pressable
            accessibilityLabel="Delete note"
            accessibilityRole="button"
            onPress={() => {
              onDelete(note);
            }}
            style={styles.iconAction}
            testID={`note-delete-button-${note.id}`}
          >
            <Ionicons color={theme.colors.text.danger} name="trash-outline" size={18} />
          </Pressable>
        </View>
      </View>

      <View style={styles.noteContentRow}>
        {thumbnailUrl ? (
          <Pressable
            accessibilityLabel={`View photos for note ${note.id}`}
            disabled={loadingPhotoNoteId === note.id}
            onPress={() => {
              onOpenPhotos(note);
            }}
            style={[
              styles.photoWrap,
              loadingPhotoNoteId === note.id ? styles.photoWrapLoading : null,
            ]}
          >
            <CachedRemoteImage uri={thumbnailUrl} style={styles.photoThumb} />
            {extraPhotoCount > 0 ? (
              <View style={styles.photoCountBadge}>
                <Text style={styles.photoCountText} variant="captionStrong">
                  +{extraPhotoCount}
                </Text>
              </View>
            ) : null}
          </Pressable>
        ) : null}

        <View style={styles.noteTextContent}>
          <ExpandableText
            collapsedNumberOfLines={note.locationText ? 3 : 4}
            containerStyle={styles.notePreviewTapTarget}
            interactionMode="tap-text"
            variant="bodyMd"
          >
            {buildNotePreview(note.content)}
          </ExpandableText>
          {note.locationText ? (
            <View style={styles.locationRow}>
              <Ionicons color={theme.colors.text.muted} name="location-outline" size={14} />
              <Text numberOfLines={1} style={styles.locationText} variant="bodySm">
                {note.locationText}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Card>
  );
}
