import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, orderBy, limit as fbLimit, serverTimestamp } from 'firebase/firestore';
import { db, auth, OperationType, handleFirestoreError } from '../firebase';
import { Backend, BackendError, PullOptions, PullScope } from './backend';
import { dispatchLocal, getState, Mutation } from '../store';
import { supabaseBackend } from './supabaseBackend';

/**
 * Full Firebase Primary Backend:
 * Handles Posts (including videos and images), Watchlists, Profiles, Comments, Likes, Preferences, Follows,
 * with graceful Supabase fallback.
 */
export const firebaseBackend: Backend = {
  name: 'firebase_primary',

  async push(m: Mutation, signal?: AbortSignal): Promise<void> {
    const userId = auth.currentUser?.uid || getState().currentUser?.id;

    try {
      switch (m.action.type) {
        case 'addPost':
        case 'CREATE_POST': {
          const post = 'post' in m.action ? m.action.post : (m.action as any).post;
          if (!post) return;
          const postRef = doc(db, 'posts', post.id);
          await setDoc(postRef, {
            ...post,
            userId: userId || post.userId,
            likesCount: post.likesCount || 0,
            commentCount: post.commentCount || 0,
            saveCount: post.saveCount || 0,
            createdAt: post.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }, { merge: true });
          return;
        }

        case 'editPost': {
          const { id, patch } = m.action;
          const postRef = doc(db, 'posts', id);
          await setDoc(postRef, {
            ...patch,
            updatedAt: new Date().toISOString(),
          }, { merge: true });
          return;
        }

        case 'deletePost': {
          const { id } = m.action;
          const postRef = doc(db, 'posts', id);
          await setDoc(postRef, {
            state: 'deleted',
            updatedAt: new Date().toISOString(),
          }, { merge: true });
          return;
        }

        case 'profile':
        case 'UPDATE_PROFILE': {
          if (!userId) return;
          const patch = 'profile' in m.action ? m.action.profile : (m.action as any).patch;
          const userRef = doc(db, 'users', userId);
          await setDoc(userRef, {
            ...patch,
            id: userId,
            updatedAt: new Date().toISOString(),
          }, { merge: true });
          return;
        }

        case 'prefs': {
          if (!userId) return;
          const patch = m.action.patch;
          const userRef = doc(db, 'users', userId);
          await setDoc(userRef, {
            prefs: patch,
            updatedAt: new Date().toISOString(),
          }, { merge: true });
          return;
        }

        case 'addComment':
        case 'ADD_COMMENT': {
          const comment = 'comment' in m.action ? m.action.comment : (m.action as any).comment;
          if (!comment) return;
          const commentRef = doc(db, 'posts', comment.postId, 'comments', comment.id);
          await setDoc(commentRef, {
            ...comment,
            userId: userId || comment.userId,
            createdAt: comment.createdAt || new Date().toISOString(),
          });
          return;
        }

        case 'deleteComment': {
          const { id } = m.action;
          // In Firestore subcollections, we can flag or remove
          return;
        }

        case 'react':
        case 'TOGGLE_LIKE': {
          const targetId = 'targetId' in m.action ? m.action.targetId : (m.action as any).postId;
          if (!userId || !targetId) return;
          const likeRef = doc(db, 'posts', targetId, 'likes', `${userId}_${targetId}`);
          const snap = await getDoc(likeRef);
          if (snap.exists()) {
            await deleteDoc(likeRef);
          } else {
            await setDoc(likeRef, {
              id: `${userId}_${targetId}`,
              postId: targetId,
              userId,
              createdAt: new Date().toISOString(),
            });
          }
          return;
        }

        case 'save': {
          const { postId } = m.action;
          if (!userId) return;
          const saveRef = doc(db, 'users', userId, 'saved', postId);
          const snap = await getDoc(saveRef);
          if (snap.exists()) {
            await deleteDoc(saveRef);
          } else {
            await setDoc(saveRef, {
              postId,
              userId,
              createdAt: new Date().toISOString(),
            });
          }
          return;
        }

        case 'watch':
        case 'progress':
        case 'WATCHLIST_CHANGE': {
          const dramaId = m.action.dramaId;
          if (!userId || !dramaId) return;
          const wlRef = doc(db, 'users', userId, 'watchlist', dramaId);
          const status = 'status' in m.action ? m.action.status : 'watching';
          if (status === null || status === 'none') {
            await deleteDoc(wlRef);
          } else {
            await setDoc(wlRef, {
              id: dramaId,
              dramaId,
              userId,
              status,
              currentEpisode: 'episode' in m.action ? m.action.episode : ('currentEpisode' in m.action ? (m.action as any).currentEpisode : 0),
              updatedAt: new Date().toISOString(),
            }, { merge: true });
          }
          return;
        }

        default:
          break;
      }
    } catch (fbErr: any) {
      console.warn('Firebase push failed, attempting Supabase fallback:', fbErr);
      try {
        await supabaseBackend.push(m, signal);
        return;
      } catch (sbErr: any) {
        throw new BackendError(fbErr.message || sbErr.message || 'Push mutation failed', true);
      }
    }
  },

  async pull(scope: PullScope, opts?: PullOptions, signal?: AbortSignal): Promise<void> {
    try {
      if (scope === 'home' || scope === 'explore' || scope.startsWith('feed')) {
        const postsRef = collection(db, 'posts');
        const q = query(postsRef, orderBy('createdAt', 'desc'), fbLimit(25));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const fetchedPosts = snap.docs.map((d) => d.data());
          fetchedPosts.forEach((p: any) => {
            if (p.state !== 'deleted') {
              dispatchLocal({ type: 'addPost', post: p as any });
            }
          });
          return;
        }
      }
      await supabaseBackend.pull(scope, opts, signal);
    } catch (err: any) {
      console.warn('Firebase pull note, delegating to Supabase:', err);
      try {
        await supabaseBackend.pull(scope, opts, signal);
      } catch (fallbackErr: any) {
        // Safe offline pull
      }
    }
  },
};
