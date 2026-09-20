import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, Share, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { aspect, colors, radius, space } from '../../constants/theme';
import { compact, seasonEpisodeLabel, timeAgo } from '../../lib/format';
import { haptic, useApp, useLayout, useRequireMember } from '../../lib/hooks';
import { DiscussionKind, Post } from '../../lib/model';
import { Avatar } from '../ui/Avatar';
import { Poster } from '../ui/Poster';
import { Sheet, SheetRow } from '../ui/Sheet';
import { Tap } from '../ui/Tap';
import { Text } from '../ui/Text';
import { useToast } from '../ui/Toast';
import { ReactionButton, ReactionSummary } from './Reactions';
import { FeedVideo } from '../media/FeedVideo';
import { ImageCarousel } from '../media/ImageCarousel';
import { SpoilerBlock, SpoilerTag } from './SpoilerBlock';
import { SyncStrip } from './SyncStrip';
import { RichText } from './RichText';

export const KIND_LABEL: Record<DiscussionKind, string> = { general: 'Discussion', theory: 'Theory', ending: 'Ending talk', character: 'Character', scene: 'Scene', question: 'Question' };
export const TYPE_LABEL: Record<Post['type'], string> = { post: 'Post', reaction: 'Reaction', discussion: 'Discussion', review: 'Review', recommendation: 'Recommendation', short: 'Short' };

interface PostCardProps {
  post: Post;
  reason?: string;
  detail?: boolean; // full body, no truncation, larger type
  hideContext?: boolean; // when already inside the drama/episode
  style?: StyleProp<ViewStyle>;
  onOpenComments?: () => void;
}

/**
 * One card for all post types. The chassis is constant (author → context → body → media → actions);
 * the body slot adapts per type (reaction = large quote, discussion = title + kind, review = rating +
 * verdict, recommendation = "if you liked" pairing).
 */
function PostCardBase({ post, reason, detail, hideContext, style, onOpenComments }: PostCardProps) {
  const router = useRouter();
  const { getUser, getDrama, getActor, isPostVeiled, isSaved, dispatch, me } = useApp();
  const require = useRequireMember();
  const toast = useToast();
  const { width, margin } = useLayout();
  const [menu, setMenu] = useState(false);
  const author = getUser(post.authorId);
  const drama = getDrama(post.context.dramaId);
  const secondary = getDrama(post.context.secondaryDramaId);
  const veiled = isPostVeiled(post);
  const saved = isSaved(post.id);
  const isMine = post.authorId === me.id;
  const multi = (drama?.seasons.length ?? 1) > 1;
  const epLabel = seasonEpisodeLabel(post.context.season, post.context.episode, drama?.seasons.length);
  const imageW = Math.min(width - margin * 2, 640);

  const open = () => router.push(`/post/${post.id}`);
  const share = () => Share.share({ message: `${post.title ?? post.body.slice(0, 80)} — https://hallyu.app/p/${post.id}` }).catch(() => {});
  const save = () =>
    require('save posts', () => {
      haptic.light();
      dispatch({ type: 'save', postId: post.id });
      toast.show({ message: saved ? 'Removed from Saved' : 'Saved', icon: saved ? 'bookmark-outline' : 'bookmark', actionLabel: saved ? undefined : 'View', onAction: () => router.push('/saved') });
    });

  const actors = useMemo(() => (post.context.actorIds ?? []).map((a) => getActor(a)).filter(Boolean), [post.context.actorIds, getActor]);

  if (post.state === 'deleted') {
    return (
      <View style={[styles.card, styles.tombstone, style]}>
        <Ionicons name="trash-outline" size={16} color={colors.textTertiary} />
        <Text variant="bodySmall" tone="tertiary">
          This post was deleted by its author.
        </Text>
      </View>
    );
  }

  const Body = (
    <View style={{ gap: space.x2 }}>
      {post.type === 'discussion' ? (
        <>
          <View style={styles.kindRow}>
            <Text variant="overline" tone="accent">
              {KIND_LABEL[post.kind ?? 'general']}
            </Text>
          </View>
          <Text variant={detail ? 'headline' : 'title'}>{post.title}</Text>
          <RichText text={post.body} variant={detail ? 'bodyLarge' : 'body'} numberOfLines={detail ? undefined : 4} tone="secondary" />
        </>
      ) : post.type === 'review' ? (
        <>
          <View style={styles.ratingRow}>
            <View style={styles.ratingBox}>
              <Text variant="titleLarge" tone="warm" numeric>
                {post.rating}
              </Text>
              <Text variant="caption" tone="warm" style={{ opacity: 0.8 }}>
                /10
              </Text>
            </View>
            <Text variant={detail ? 'titleLarge' : 'title'} style={{ flex: 1 }}>
              {post.verdict}
            </Text>
          </View>
          <RichText text={post.body} variant={detail ? 'bodyLarge' : 'body'} numberOfLines={detail ? undefined : 5} tone="secondary" />
        </>
      ) : post.type === 'recommendation' ? (
        <>
          {secondary ? (
            <Text variant="caption" tone="secondary">
              If you liked{' '}
              <Text variant="caption" tone="primary">
                {secondary.title}
              </Text>
            </Text>
          ) : null}
          <RichText text={post.body} variant={detail ? 'bodyLarge' : 'body'} numberOfLines={detail ? undefined : 6} />
        </>
      ) : post.type === 'reaction' ? (
        <RichText text={post.body} variant={detail ? 'headline' : 'titleLarge'} numberOfLines={detail ? undefined : 5} />
      ) : (
        <RichText text={post.body} variant={detail ? 'bodyLarge' : 'body'} numberOfLines={detail ? undefined : 8} />
      )}
      {post.video ? (
        <FeedVideo
          post={post}
          width={imageW}
          detail={detail}
          onOpen={
            post.type === 'short'
              ? () => router.push({ pathname: '/shorts', params: { id: post.id } })
              : detail
                ? () => router.push({ pathname: '/media', params: { postId: post.id, index: '0' } })
                : open
          }
        />
      ) : post.images?.length ? (
        <ImageCarousel
          images={post.images}
          width={imageW}
          height={post.images.length > 1 ? Math.round(imageW * 1.05) : Math.round(imageW / aspect.postImage) * 0.7}
          onPressImage={(i) => router.push({ pathname: '/media', params: { postId: post.id, index: String(i) } })}
        />
      ) : null}
    </View>
  );

  return (
    <>
      <Tap onPress={detail ? undefined : open} disabled={detail} scaleTo={0.995} accessibilityRole={detail ? undefined : 'button'} style={[styles.card, style]}>
        {reason ? (
          <View style={styles.reason}>
            <Ionicons name="sparkles-outline" size={12} color={colors.textTertiary} />
            <Text variant="caption" tone="tertiary" numberOfLines={1}>
              {reason}
            </Text>
          </View>
        ) : null}

        {/* Author */}
        <View style={styles.author}>
          <Pressable onPress={() => author && router.push(`/user/${author.handle}`)} accessibilityRole="link" accessibilityLabel={`${author?.displayName ?? 'Unknown'} profile`} hitSlop={6}>
            <Avatar uri={author?.avatarUrl} name={author?.displayName ?? '?'} size="md" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              <Text variant="titleSmall" numberOfLines={1} onPress={() => author && router.push(`/user/${author.handle}`)}>
                {author?.displayName ?? 'Unknown'}
              </Text>
              {author?.verified ? <Ionicons name="checkmark-circle" size={14} color={colors.accentText} /> : null}
              <Text variant="caption" tone="tertiary">
                @{author?.handle} · {timeAgo(post.createdAt)}
                {post.editedAt ? ' · edited' : ''}
              </Text>
            </View>
            <View style={styles.metaRow}>
              <Text variant="caption" tone="secondary">
                {TYPE_LABEL[post.type]}
              </Text>
              <SpoilerTag level={post.spoiler} compact />
            </View>
          </View>
          <Pressable onPress={() => setMenu(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel="More options" style={styles.more}>
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        {/* Context strip */}
        {!hideContext && drama ? (
          <Pressable
            onPress={() => router.push(post.context.episode ? `/episode/${drama.id}/${post.context.season ?? 1}/${post.context.episode}` : `/drama/${drama.id}`)}
            style={styles.context}
            accessibilityRole="link"
            accessibilityLabel={`${drama.title}${epLabel ? ` ${epLabel}` : ''}`}
          >
            <Poster drama={drama} width={28} rounded={4} />
            <Text variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
              {drama.title}
            </Text>
            {epLabel ? (
              <View style={styles.epChip}>
                <Text variant="caption" tone="accent" numeric>
                  {epLabel}
                </Text>
              </View>
            ) : null}
            {actors.length ? (
              <Text variant="caption" tone="tertiary" numberOfLines={1} style={{ flexShrink: 1 }}>
                · {actors.map((a) => a!.name).join(', ')}
              </Text>
            ) : null}
          </Pressable>
        ) : null}

        {/* Body (veiled or not) */}
        <SpoilerBlock id={post.id} level={post.spoiler} drama={drama} season={post.context.season} episode={post.context.episode} veiled={veiled}>
          {Body}
        </SpoilerBlock>

        {/* Delivery state for your own content */}
        <SyncStrip postId={post.id} state={post.state} noun={TYPE_LABEL[post.type].toLowerCase()} />

        {/* Hashtags */}
        {post.hashtags.length && !detail ? null : null}

        {/* Actions */}
        <View style={styles.actions}>
          <ReactionButton targetId={post.id} counts={post.reactions} />
          <Pressable onPress={onOpenComments ?? open} hitSlop={6} style={styles.action} accessibilityRole="button" accessibilityLabel={`${post.commentCount} comments`}>
            <Ionicons name="chatbubble-outline" size={20} color={colors.textSecondary} />
            {post.commentCount ? (
              <Text variant="label" tone="secondary" numeric>
                {compact(post.commentCount)}
              </Text>
            ) : null}
          </Pressable>
          <Pressable onPress={save} hitSlop={6} style={styles.action} accessibilityRole="button" accessibilityLabel={saved ? 'Unsave' : 'Save'}>
            <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={20} color={saved ? colors.accentText : colors.textSecondary} />
          </Pressable>
          <Pressable onPress={share} hitSlop={6} style={styles.action} accessibilityRole="button" accessibilityLabel="Share">
            <Ionicons name="share-outline" size={20} color={colors.textSecondary} />
          </Pressable>
          <View style={{ flex: 1 }} />
          <ReactionSummary counts={post.reactions} />
        </View>
      </Tap>

      <Sheet visible={menu} onClose={() => setMenu(false)} title={author ? `${TYPE_LABEL[post.type]} by ${author.displayName}` : TYPE_LABEL[post.type]}>
        <SheetRow
          icon={saved ? 'bookmark' : 'bookmark-outline'}
          label={saved ? 'Remove from Saved' : 'Save'}
          onPress={() => {
            setMenu(false);
            save();
          }}
        />
        <SheetRow
          icon="share-outline"
          label="Share"
          onPress={() => {
            setMenu(false);
            share();
          }}
        />
        <SheetRow
          icon="link-outline"
          label="Copy link"
          onPress={() => {
            setMenu(false);
            toast.show('Link copied');
          }}
        />
        {drama ? (
          <SheetRow
            icon="film-outline"
            label={`Go to ${drama.title}`}
            onPress={() => {
              setMenu(false);
              router.push(`/drama/${drama.id}`);
            }}
          />
        ) : null}
        {isMine ? (
          <>
            {Date.now() - new Date(post.createdAt).getTime() < 15 * 60_000 ? (
              <SheetRow
                icon="create-outline"
                label="Edit"
                detail="Within 15 minutes of posting"
                onPress={() => {
                  setMenu(false);
                  router.push({ pathname: '/create/[type]', params: { type: post.type, editId: post.id } });
                }}
              />
            ) : null}
            <SheetRow
              icon="trash-outline"
              label="Delete"
              tone="danger"
              onPress={() => {
                setMenu(false);
                dispatch({ type: 'deletePost', id: post.id });
                toast.show({ message: 'Post deleted' });
              }}
            />
          </>
        ) : (
          <>
            <SheetRow
              icon="volume-mute-outline"
              label={`Mute @${author?.handle}`}
              detail="Hide their posts from your feeds"
              onPress={() =>
                require('mute people', () => {
                  setMenu(false);
                  dispatch({ type: 'muteUser', userId: post.authorId, on: true });
                  toast.show({ message: `Muted @${author?.handle}`, actionLabel: 'Undo', onAction: () => dispatch({ type: 'muteUser', userId: post.authorId, on: false }) });
                })
              }
            />
            {drama ? (
              <SheetRow
                icon="eye-off-outline"
                label={`Mute ${drama.title}`}
                detail="Hide posts about this drama"
                onPress={() =>
                  require('mute dramas', () => {
                    setMenu(false);
                    dispatch({ type: 'muteDrama', dramaId: drama.id, on: true });
                    toast.show({ message: `Muted ${drama.title}`, actionLabel: 'Undo', onAction: () => dispatch({ type: 'muteDrama', dramaId: drama.id, on: false }) });
                  })
                }
              />
            ) : null}
            <SheetRow
              icon="flag-outline"
              label="Report"
              detail="Unmarked spoiler, harassment, spam…"
              onPress={() => {
                setMenu(false);
                router.push({ pathname: '/report', params: { targetId: post.id, kind: 'post' } });
              }}
            />
            <SheetRow
              icon="ban-outline"
              label={`Block @${author?.handle}`}
              tone="danger"
              onPress={() =>
                require('block people', () => {
                  setMenu(false);
                  dispatch({ type: 'block', userId: post.authorId, on: true });
                  toast.show({ message: `Blocked @${author?.handle}. You won't see each other.`, actionLabel: 'Undo', onAction: () => dispatch({ type: 'block', userId: post.authorId, on: false }) });
                })
              }
            />
          </>
        )}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  card: { paddingHorizontal: space.margin, paddingVertical: space.x4, gap: space.x3, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle, backgroundColor: colors.canvas },
  tombstone: { flexDirection: 'row', alignItems: 'center', gap: space.x2 },
  reason: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: -4 },
  author: { flexDirection: 'row', alignItems: 'center', gap: space.x3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 1 },
  more: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginRight: -8 },
  context: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x2,
    backgroundColor: colors.surface1,
    borderRadius: radius.sm,
    paddingVertical: 6,
    paddingHorizontal: 8,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  epChip: { backgroundColor: colors.accentSoft, paddingHorizontal: 6, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  kindRow: { flexDirection: 'row' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: space.x3 },
  ratingBox: { flexDirection: 'row', alignItems: 'baseline', backgroundColor: colors.warmSoft, paddingHorizontal: 10, height: 40, borderRadius: radius.sm },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.x2, marginTop: -4 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 6 },
});

/** Memoised: with tracked store getters, a card re-renders only when its own data changes. */
export const PostCard = React.memo(PostCardBase);
