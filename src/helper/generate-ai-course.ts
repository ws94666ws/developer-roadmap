import {
  generateAiCourseStructure,
  readStream,
  type AiCourse,
} from '../lib/ai';
import { queryClient } from '../stores/query-client';
import { aiLimitOptions } from '../queries/ai-course';
import type { QuestionAnswerChatMessage } from '../components/ContentGenerator/QuestionAnswerChat';

type GenerateCourseOptions = {
  term: string;
  slug?: string;
  isForce?: boolean;
  prompt?: string;
  onCourseIdChange?: (courseId: string) => void;
  onCourseSlugChange?: (courseSlug: string) => void;
  onCourseChange?: (course: AiCourse, rawData: string) => void;
  onLoadingChange?: (isLoading: boolean) => void;
  onCreatorIdChange?: (creatorId: string) => void;
  onError?: (error: string) => void;
  src?: string;
  questionAndAnswers?: QuestionAnswerChatMessage[];
};

export async function generateCourse(options: GenerateCourseOptions) {
  const {
    term,
    slug,
    onCourseIdChange,
    onCourseSlugChange,
    onCourseChange,
    onLoadingChange,
    onError,
    onCreatorIdChange,
    isForce = false,
    prompt,
    src = 'search',
    questionAndAnswers,
  } = options;

  onLoadingChange?.(true);
  onCourseChange?.(
    {
      title: '',
      modules: [],
      done: [],
    },
    '',
  );
  onError?.('');

  try {
    let response = null;

    if (slug && isForce) {
      response = await fetch(
        `${import.meta.env.PUBLIC_API_URL}/v1-regenerate-ai-course/${slug}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            isForce,
            customPrompt: prompt,
          }),
        },
      );
    } else {
      response = await fetch(
        `${import.meta.env.PUBLIC_API_URL}/v1-generate-ai-course`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            keyword: term,
            isForce,
            customPrompt: prompt,
            questionAndAnswers,
            src,
          }),
          credentials: 'include',
        },
      );
    }

    if (!response.ok) {
      const data = await response.json();
      console.error(
        'Error generating course:',
        data?.message || 'Something went wrong',
      );
      onLoadingChange?.(false);
      onError?.(data?.message || 'Something went wrong');
      return;
    }

    const reader = response.body?.getReader();

    if (!reader) {
      console.error('Failed to get reader from response');
      onError?.('Something went wrong');
      onLoadingChange?.(false);
      return;
    }

    const COURSE_ID_REGEX = new RegExp('@COURSEID:(\\w+)@');
    const COURSE_SLUG_REGEX = new RegExp(/@COURSESLUG:([\w-]+)@/);
    const CREATOR_ID_REGEX = new RegExp('@CREATORID:(\\w+)@');

    await readStream(reader, {
      onStream: async (result) => {
        if (result.includes('@COURSEID') || result.includes('@COURSESLUG')) {
          const courseIdMatch = result.match(COURSE_ID_REGEX);
          const courseSlugMatch = result.match(COURSE_SLUG_REGEX);
          const creatorIdMatch = result.match(CREATOR_ID_REGEX);
          const extractedCourseId = courseIdMatch?.[1] || '';
          const extractedCourseSlug = courseSlugMatch?.[1] || '';
          const extractedCreatorId = creatorIdMatch?.[1] || '';

          if (extractedCourseSlug) {
            window.history.replaceState(
              {
                courseId: extractedCourseId,
                courseSlug: extractedCourseSlug,
                term,
              },
              '',
              `${origin}/ai/${extractedCourseSlug}`,
            );
          }

          result = result
            .replace(COURSE_ID_REGEX, '')
            .replace(COURSE_SLUG_REGEX, '')
            .replace(CREATOR_ID_REGEX, '');

          onCourseIdChange?.(extractedCourseId);
          onCourseSlugChange?.(extractedCourseSlug);
          onCreatorIdChange?.(extractedCreatorId);
        }

        try {
          const aiCourse = generateAiCourseStructure(result);
          onCourseChange?.(aiCourse, result);
        } catch (e) {
          console.error('Error parsing streamed course content:', e);
        }
      },
      onStreamEnd: async (result) => {
        result = result
          .replace(COURSE_ID_REGEX, '')
          .replace(COURSE_SLUG_REGEX, '')
          .replace(CREATOR_ID_REGEX, '');

        onLoadingChange?.(false);
        queryClient.invalidateQueries(aiLimitOptions());
      },
    });
  } catch (error: any) {
    onError?.(error?.message || 'Something went wrong');
    console.error('Error in course generation:', error);
    onLoadingChange?.(false);
  }
}
